<template>
  <div class="map-container">
    <div class="map-overlay">
      <div class="title">ZHEJIANG RISK TRACEABILITY</div>
      <div class="subtitle">基于实体名称的语义定位流转图</div>
      
      <div class="legend">
        <div class="legend-item"><span class="dot producer"></span> 养殖户</div>
        <div class="legend-item"><span class="dot market"></span> 市场</div>
        <div class="legend-item"><span class="line risk-flow"></span> 风险流向</div>
      </div>
    </div>

    <div ref="mapRef" class="map"></div>
    <div ref="tooltipRef" class="tooltip"></div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import * as d3 from 'd3';
import axios from 'axios';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';

// --- 1. 数据接入 ---
const store = useExplorerStore();
const { samples, context, selectedSampleId } = storeToRefs(store);

const mapRef = ref(null);
const tooltipRef = ref(null);
let svg = null;
let zoomLayer = null;
let districtGroup = null;
let riskGroup = null;

// 缓存数据
let geoCityData = null;
let districtFeatures = []; 
// [关键] 地理名称索引： { "义乌市": [lng, lat], "西湖区": [lng, lat], "杭州市": [lng, lat] ... }
let geoIndex = {}; 
// 缓存所有区县的中心点数组 (用于纯随机兜底)
let districtAnchors = [];

const locationCache = new Map();

// --- 2. 核心算法：智能语义定位 ---
const getSmartCoord = (name, type) => {
  if (!name) return [120.15, 30.28]; // 默认中心
  if (locationCache.has(name)) return locationCache.get(name);

  let anchor = null;
  let matchLevel = 'none'; // 'district', 'city', 'none'

  // 1. 尝试匹配区县 (优先级最高)
  // 遍历索引中的区县名
  for (const key in geoIndex) {
    if (geoIndex[key].level === 'district' && name.includes(key)) {
      anchor = geoIndex[key].coord;
      matchLevel = 'district';
      break;
    }
  }

  // 2. 如果没匹配到区县，尝试匹配地级市
  if (!anchor) {
    for (const key in geoIndex) {
      if (geoIndex[key].level === 'city' && name.includes(key)) {
        anchor = geoIndex[key].coord;
        matchLevel = 'city';
        break;
      }
    }
  }

  // 3. 如果都没匹配到，使用哈希算法随机分配一个区县 (兜底)
  if (!anchor && districtAnchors.length > 0) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const index = Math.abs(hash) % districtAnchors.length;
    anchor = districtAnchors[index];
    matchLevel = 'random';
  }

  // 4. 施加随机抖动 (Jitter) 以免重叠
  // 如果匹配到了区县，抖动小一点；匹配到市，抖动大一点；随机的，适中
  let spread = 0.03; 
  if (matchLevel === 'city') spread = 0.15; // 城市级范围大，散开点
  if (matchLevel === 'district') spread = 0.04; // 区县级范围小，聚拢点
  
  // 基于名字生成的伪随机数，保证同一个名字每次位置固定
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const r1 = (Math.sin(hash) * 10000) % 1;
  const r2 = (Math.cos(hash) * 10000) % 1;

  const finalCoord = [
    anchor[0] + (r1 - 0.5) * spread * 2,
    anchor[1] + (r2 - 0.5) * spread * 2
  ];
  
  locationCache.set(name, finalCoord);
  return finalCoord;
};

// --- 3. 数据加载与索引构建 ---
const fetchGeoJson = async () => {
  try {
    // 1. 获取市级数据 (用于城市级匹配)
    const cityRes = await axios.get('https://geojson.cn/api/china/1.5.2/330000.json');
    geoCityData = cityRes.data;
    
    // 构建市级索引
    geoCityData.features.forEach(f => {
      const center = f.properties.centroid || f.properties.center || d3.geoCentroid(f);
      const name = f.properties.name; // 如 "杭州"
      geoIndex[name] = { coord: center, level: 'city' };
      if (!name.endsWith('市')) geoIndex[name + '市'] = { coord: center, level: 'city' };
    });

    // 2. 获取区县数据 (用于区县级匹配)
    const allAdcodes = [
      '330100', '330200', '330300', '330400', '330500', '330600',
      '330700', '330800', '330900', '331000', '331100'
    ];

    let allFeatures = [];
    const promises = allAdcodes.map(code => 
      axios.get(`http://geojson.cn/api/62a24911/${code}.json`).catch(e => null)
    );
    const results = await Promise.all(promises);
    
    results.forEach(res => {
      if (res && res.data && res.data.features) {
        allFeatures = allFeatures.concat(res.data.features);
      }
    });

    // 构建区县索引
    allFeatures.forEach(f => {
      const center = f.properties.centroid || f.properties.center || d3.geoCentroid(f);
      const name = f.properties.name; // 如 "西湖区"
      geoIndex[name] = { coord: center, level: 'district' };
      // 存入 anchor 列表供兜底使用
      districtAnchors.push(center);
    });

    districtFeatures = allFeatures; // 保存用于绘图
    
    // 绘图
    drawMap();

  } catch (error) {
    console.error("Map Data Error:", error);
  }
};

// --- 4. 绘图逻辑 ---
const drawMap = () => {
  const mapElement = mapRef.value;
  if (!mapElement || !geoCityData) return;

  const width = mapElement.clientWidth;
  const height = mapElement.clientHeight;

  d3.select(mapElement).selectAll('svg').remove();

  svg = d3.select(mapElement).append('svg')
    .attr('width', width).attr('height', height)
    .style('background', '#ffffff');

  defineGradients(svg);

  zoomLayer = svg.append('g');
  
  // A. 直接绘制所有区县 (一步到位，不需要缩放加载)
  districtGroup = zoomLayer.append('g').attr('class', 'district-layer');
  riskGroup = zoomLayer.append('g').attr('class', 'risk-layer');

  // 投影适配：自动填满容器
  const projection = d3.geoMercator().fitExtent(
    [[20, 20], [width - 20, height - 20]], 
    { type: "FeatureCollection", features: districtFeatures }
  );
  const path = d3.geoPath().projection(projection);

  // 绘制底图
  districtGroup.selectAll('path')
    .data(districtFeatures)
    .enter().append('path')
    .attr('d', path)
    .attr('fill', '#f5f7fa')
    .attr('stroke', '#dcdfe6')
    .attr('stroke-width', 0.5)
    .on('mouseover', function(e, d) {
       d3.select(this).attr('fill', '#e6f7ff').attr('stroke', '#409eff');
       showTooltip(e, `<b>${d.properties.name}</b>`); // 简易提示
    })
    .on('mouseout', function() {
       d3.select(this).attr('fill', '#f5f7fa').attr('stroke', '#dcdfe6');
       hideTooltip();
    });

  // B. 绘制流向
  drawRiskFlows(projection);

  // C. 缩放
  const zoom = d3.zoom()
    .scaleExtent([0.8, 8])
    .on('zoom', (e) => {
       zoomLayer.attr('transform', e.transform);
       // 语义缩放：保持流向线和点的大小适中
       const k = e.transform.k;
       riskGroup.selectAll('path.flow-line').attr('stroke-width', d => (d.isFocus ? 2.5 : 1) / k);
       riskGroup.selectAll('circle').attr('r', d => (d.baseR || 3) / Math.sqrt(k));
    });
  
  svg.call(zoom);
};

// --- 5. 风险流转绘制 ---
const drawRiskFlows = (projection) => {
  if (!riskGroup || !samples.value) return;
  riskGroup.selectAll('*').remove();

  // 如果没有投影 (resize后)，重新计算
  if (!projection) {
     const w = mapRef.value.clientWidth;
     const h = mapRef.value.clientHeight;
     projection = d3.geoMercator().fitExtent([[20,20],[w-20,h-20]], {type:"FeatureCollection", features: districtFeatures});
  }

  const links = [];
  const nodesMap = new Map();
  const currentId = String(selectedSampleId.value);

  samples.value.forEach(sample => {
    const id = String(sample.id);
    const ctx = context.value[id];
    if (!ctx) return;
    
    const farmer = ctx.farmers?.[0] || 'Unknown Producer';
    const market = ctx.markets?.[0] || 'Unknown Market';
    const isRisk = sample.riskLevel !== '低风险'; 
    const isFocus = (id === currentId);

    // [核心] 使用智能坐标
    const pCoord = getSmartCoord(farmer, 'producer');
    const mCoord = getSmartCoord(market, 'market');
    
    const src = projection(pCoord);
    const tgt = projection(mCoord);

    // 存节点
    if(!nodesMap.has(farmer)) nodesMap.set(farmer, {x:src[0], y:src[1], type:'producer', isFocus: false});
    if(!nodesMap.has(market)) nodesMap.set(market, {x:tgt[0], y:tgt[1], type:'market', isFocus: false});
    
    if(isFocus) {
        nodesMap.get(farmer).isFocus = true;
        nodesMap.get(market).isFocus = true;
    }

    links.push({ id, src, tgt, isRisk, isFocus });
  });

  // 1. 背景线 (淡)
  riskGroup.selectAll('path.bg-link')
    .data(links.filter(d => !d.isFocus))
    .enter().append('path')
    .attr('d', d => getCurvePath(d.src, d.tgt))
    .attr('fill', 'none')
    .attr('stroke', '#999')
    .attr('stroke-width', 0.5)
    .attr('opacity', 0.05);

  // 2. 节点
  const nodesArr = Array.from(nodesMap.entries()).map(([k,v])=>({name:k, ...v}));
  
  // 呼吸光圈 (仅选中)
  riskGroup.selectAll('circle.pulse')
    .data(nodesArr.filter(d => d.isFocus))
    .enter().append('circle')
    .attr('cx', d => d.x).attr('cy', d => d.y)
    .attr('r', 10)
    .attr('fill', 'none')
    .attr('stroke', d => d.type==='producer'?'#67c23a':'#409eff')
    .attr('stroke-width', 1)
    .append('animate').attr('attributeName','r').attr('from','4').attr('to','20').attr('dur','1.5s').attr('repeatCount','indefinite');
  
  riskGroup.selectAll('circle.pulse-op')
    .data(nodesArr.filter(d => d.isFocus))
    .enter().append('circle')
    .attr('cx', d => d.x).attr('cy', d => d.y).attr('r', 20)
    .attr('fill','none').attr('stroke', d => d.type==='producer'?'#67c23a':'#409eff')
    .attr('opacity', 0)
    .append('animate').attr('attributeName','opacity').attr('from','0.8').attr('to','0').attr('dur','1.5s').attr('repeatCount','indefinite');

  // 实心点
  riskGroup.selectAll('circle.node')
    .data(nodesArr)
    .enter().append('circle')
    .attr('cx', d => d.x).attr('cy', d => d.y)
    .attr('r', d => { const r = d.isFocus ? 5 : 2.5; d.baseR=r; return r; })
    .attr('fill', d => d.type==='producer'?'#67c23a':'#409eff')
    .attr('stroke', '#fff')
    .attr('stroke-width', 1)
    .attr('opacity', d => selectedSampleId.value ? (d.isFocus?1:0.1) : 0.6)
    .on('mouseover', (e, d) => showTooltip(e, `<b>${d.name}</b>`))
    .on('mouseout', hideTooltip);

  // 3. 高亮流向 (带粒子)
  const activeLink = links.find(d => d.isFocus);
  if (activeLink) {
     const pathData = getCurvePath(activeLink.src, activeLink.tgt);
     
     // 路径
     riskGroup.append('path')
       .attr('class', 'flow-line')
       .attr('d', pathData)
       .attr('fill', 'none')
       .attr('stroke', activeLink.isRisk ? '#ff5252' : 'url(#grad-safe)')
       .attr('stroke-width', 2.5)
       .attr('stroke-linecap', 'round')
       .attr('filter', 'url(#glow)');

     // 粒子
     const p = riskGroup.append('circle')
       .attr('r', 4).attr('fill', '#fff').attr('filter', 'url(#glow)');
     p.append('animateMotion').attr('dur', '1.5s').attr('repeatCount', 'indefinite').attr('path', pathData);
  }
};

const getCurvePath = (src, tgt) => {
  const dx = tgt[0]-src[0], dy = tgt[1]-src[1], dr = Math.sqrt(dx*dx+dy*dy);
  return `M${src[0]},${src[1]}A${dr*1.2},${dr*1.2} 0 0,1 ${tgt[0]},${tgt[1]}`;
};

const defineGradients = (svg) => {
  const defs = svg.append('defs');
  const f = defs.append("filter").attr("id", "glow");
  f.append("feGaussianBlur").attr("stdDeviation","2.5").attr("result","coloredBlur");
  const m = f.append("feMerge");
  m.append("feMergeNode").attr("in","coloredBlur");
  m.append("feMergeNode").attr("in","SourceGraphic");

  const g = defs.append("linearGradient").attr("id", "grad-safe");
  g.append("stop").attr("offset","0%").attr("stop-color","#67c23a");
  g.append("stop").attr("offset","100%").attr("stop-color","#409eff");
};

// Tooltip
const showTooltip = (e, html) => {
  const tip = d3.select(tooltipRef.value);
  tip.style('opacity', 1).html(html).style('left', (e.offsetX+10)+'px').style('top', (e.offsetY+10)+'px');
};
const hideTooltip = () => d3.select(tooltipRef.value).style('opacity', 0);

watch([samples, selectedSampleId], () => drawRiskFlows(null));

onMounted(() => {
  fetchGeoJson();
  window.addEventListener('resize', () => drawMap());
});
onUnmounted(() => window.removeEventListener('resize', drawMap));
</script>

<style scoped>
.map-container { position: relative; width: 100%; height: 100%; overflow: hidden; background: #fff; }
.map { width: 100%; height: 100%; cursor: grab; }
.map:active { cursor: grabbing; }

.map-overlay { position: absolute; top: 15px; left: 15px; pointer-events: none; }
.title { font-size: 16px; font-weight: 800; color: #303133; letter-spacing: 1px; }
.subtitle { font-size: 11px; color: #909399; margin-bottom: 8px; }
.legend { pointer-events: auto; background: rgba(255,255,255,0.95); padding: 10px; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
.legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 4px; color: #606266; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.producer { background: #67c23a; }
.dot.market { background: #409eff; }
.line { width: 16px; height: 3px; border-radius: 2px; }
.line.risk-flow { background: linear-gradient(to right, #67c23a, #ff5252); }

.tooltip { position: absolute; pointer-events: none; background: rgba(0,0,0,0.85); color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 12px; z-index: 999; }
</style>