<template>
  <div class="map-container" @click.self="resetView">
    <div class="map-header">
      <div class="title">ZHEJIANG RISK INTELLIGENCE</div>
      <div class="subtitle">
        <span v-if="selectedSampleId" class="mode-tag focus">FOCUS: 单样本溯源</span>
        <span v-else-if="clickedDistrict" class="mode-tag region">REGION: {{ clickedDistrict }} 流向透视</span>
        <span v-else class="mode-tag macro">MACRO: 全域风险热力</span>
      </div>
    </div>

    <div class="legend-panel">
      <div class="legend-section">
        <div class="legend-title">Risk Heatmap</div>
        <div class="legend-gradient">
          <span>Low</span>
          <div class="grad-bar"></div>
          <span>High</span>
        </div>
      </div>
      <div class="legend-divider"></div>
      
      <div class="legend-section">
        <div class="legend-title">Nodes (节点类型)</div>
        <div class="legend-item">
          <span class="shape-circle producer"></span> <span>养殖户 (Producer)</span>
        </div>
        <div class="legend-item">
          <span class="shape-rect market"></span> <span>农贸市场 (Market)</span>
        </div>
      </div>

      <div class="legend-section" v-if="selectedSampleId || clickedDistrict">
        <div class="legend-divider"></div>
        <div class="legend-title">Flow Paths</div>
        <div class="legend-item"><span class="line risk"></span> 风险流向</div>
        <div class="legend-item"><span class="line safe"></span> 常规流向</div>
      </div>
    </div>

    <div ref="mapRef" class="map"></div>
    <div ref="tooltipRef" class="tooltip"></div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch, computed } from 'vue';
import * as d3 from 'd3';
import axios from 'axios';
import { useExplorerStore } from '@/stores/explorerStore';
import { storeToRefs } from 'pinia';

// --- 1. Store 数据接入 ---
const store = useExplorerStore();
const { samples, context, selectedSampleId } = storeToRefs(store);

const mapRef = ref(null);
const tooltipRef = ref(null);

// 交互状态
const clickedDistrict = ref(null);

// D3 缓存
let svg, zoomLayer, districtGroup, flowGroup;
let geoCityData = null, geoDistrictData = null;
let districtFeatures = [], geoIndex = {}, districtAnchors = [];
let districtStats = {}; 
const locationCache = new Map();

// --- 2. 模拟定位算法 ---
const getSmartLocation = (name) => {
  if (!name) return { coord: [120.15, 30.28], name: 'Unknown', level: 'random' };
  if (locationCache.has(name)) return locationCache.get(name);

  let anchor = null, distName = null, matchLevel = 'random';

  // 优先匹配区县
  for (const key in geoIndex) {
    if (geoIndex[key].level === 'district' && name.includes(key)) {
      anchor = geoIndex[key].coord;
      distName = key;
      matchLevel = 'district';
      break;
    }
  }
  // 其次匹配城市
  if (!anchor) {
    for (const key in geoIndex) {
      if (geoIndex[key].level === 'city' && name.includes(key)) {
        anchor = geoIndex[key].coord;
        matchLevel = 'city';
        break;
      }
    }
  }
  // 兜底
  if (!anchor && districtAnchors.length > 0) {
    let hash = 0; for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const index = Math.abs(hash) % districtAnchors.length;
    anchor = districtAnchors[index].coord;
    matchLevel = 'random';
  }

  const spread = 0.03; 
  let hash = 0; for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const r1 = (Math.sin(hash) * 10000) % 1;
  const r2 = (Math.cos(hash) * 10000) % 1;
  const coord = [anchor[0] + (r1 - 0.5) * spread, anchor[1] + (r2 - 0.5) * spread];

  const result = { coord, name: distName || 'Unknown', matchLevel };
  locationCache.set(name, result);
  return result;
};

// --- 3. 统计热力 ---
const calculateStats = () => {
  // 重置统计
  districtStats = {};
  districtFeatures.forEach(f => districtStats[f.properties.name] = { riskCount: 0 });

  if (!samples.value) return;

  samples.value.forEach(sample => {
    // 风险判断
    const isRisk = sample.riskLevel !== '低风险'; 
    if (!isRisk) return;

    const ctx = context.value[sample.id];
    if (!ctx) return;

    const pLoc = getSmartLocation(ctx.farmers?.[0]);
    const mLoc = getSmartLocation(ctx.markets?.[0]);

    // 只有真实匹配到区县的才计入热力
    if (pLoc.matchLevel === 'district' && pLoc.name && districtStats[pLoc.name]) {
      districtStats[pLoc.name].riskCount++;
    }
    if (mLoc.matchLevel === 'district' && mLoc.name && districtStats[mLoc.name]) {
      districtStats[mLoc.name].riskCount++;
    }
  });
};

// --- 4. 初始化加载 ---
const fetchGeoJson = async () => {
  try {
    // 1. 加载市级地图
    const cityRes = await axios.get('https://geojson.cn/api/china/1.5.2/330000.json');
    geoCityData = cityRes.data;
    geoCityData.features.forEach(f => { 
        geoIndex[f.properties.name] = { coord: d3.geoCentroid(f), level: 'city' }; 
    });

    // 2. 加载区县地图 (并行)
    const codes = ['330100','330200','330300','330400','330500','330600','330700','330800','330900','331000','331100'];
    const results = await Promise.all(codes.map(c => axios.get(`http://geojson.cn/api/62a24911/${c}.json`).catch(()=>null)));
    
    let allF = [];
    results.forEach(r => { if(r?.data?.features) allF = allF.concat(r.data.features); });
    districtFeatures = allF;
    geoDistrictData = { type: "FeatureCollection", features: allF };

    // 构建区县索引
    allF.forEach(f => {
      const center = d3.geoCentroid(f);
      geoIndex[f.properties.name] = { coord: center, level: 'district' };
      // 兼容简称 (如 "西湖区" -> "西湖")
      const short = f.properties.name.replace(/(区|县|市)$/, '');
      if(short !== f.properties.name) geoIndex[short] = { coord: center, level: 'district' };
      
      districtAnchors.push({ name: f.properties.name, coord: center });
    });

    // 计算并绘图
    calculateStats();
    drawMap();

  } catch (e) { console.error(e); }
};

// --- 5. 绘图主逻辑 ---
const drawMap = () => {
  const el = mapRef.value;
  if (!el || !geoDistrictData) return;
  d3.select(el).selectAll('svg').remove();
  const width = el.clientWidth, height = el.clientHeight;

  svg = d3.select(el).append('svg').attr('width', width).attr('height', height).style('background', '#fff');
  defineDefs(svg);

  zoomLayer = svg.append('g');
  districtGroup = zoomLayer.append('g').attr('class', 'district-layer');
  flowGroup = zoomLayer.append('g').attr('class', 'flow-layer');

  const projection = d3.geoMercator().fitExtent([[20,20],[width-20,height-20]], geoDistrictData);
  const path = d3.geoPath().projection(projection);

  renderHeatmap(path);
  updateFlows(projection);

  const zoom = d3.zoom().scaleExtent([0.8, 8]).on('zoom', e => {
    zoomLayer.attr('transform', e.transform);
    const k = e.transform.k;
    flowGroup.selectAll('path').attr('stroke-width', d => (d.isFocus?2.5:1)/k);
    
    // 缩放时调整点的大小
    flowGroup.selectAll('.node-shape').attr('transform', function(d) {
        // 获取原始位置
        const cx = d.x; 
        const cy = d.y;
        // 计算缩放比例 (反向缩放以保持视觉大小一致)
        const scale = (d.isFocus ? 1.5 : 1) / Math.sqrt(k);
        return `translate(${cx},${cy}) scale(${scale})`;
    });
  });
  
  svg.call(zoom).on("dblclick.zoom", null);
};

// --- 6. 热力图渲染 ---
const renderHeatmap = (path) => {
  const maxVal = d3.max(Object.values(districtStats), d => d.riskCount) || 1;
  const colorScale = d3.scaleSequential(d3.interpolateReds).domain([0, maxVal * 1.2]);

  districtGroup.selectAll('path')
    .data(districtFeatures)
    .join('path')
    .attr('d', path)
    .attr('stroke', '#e0e0e0').attr('stroke-width', 0.5)
    .attr('fill', d => {
      const count = districtStats[d.properties.name]?.riskCount || 0;
      return count > 0 ? colorScale(count) : '#f9fafb';
    })
    .style('cursor', 'pointer')
    .on('click', (e, d) => {
      e.stopPropagation();
      clickedDistrict.value = d.properties.name;
      store.selectedSampleId = null; // 切换到区域模式
    })
    .on('mouseover', function(e, d) {
       d3.select(this).attr('stroke', '#555').attr('stroke-width', 1).raise();
       const count = districtStats[d.properties.name]?.riskCount || 0;
       showTooltip(e, `<b>${d.properties.name}</b><br>高风险样本: ${count}`);
    })
    .on('mouseout', function() {
       d3.select(this).attr('stroke', '#e0e0e0').attr('stroke-width', 0.5);
       hideTooltip();
    });
};

// --- 7. 流向逻辑 ---
const updateFlows = (projection) => {
  flowGroup.selectAll('*').remove();
  
  if (!projection) { 
     const w=mapRef.value.clientWidth, h=mapRef.value.clientHeight;
     projection=d3.geoMercator().fitExtent([[20,20],[w-20,h-20]], geoDistrictData);
  }

  // A. 聚焦模式 (单样本)
  if (selectedSampleId.value) {
    const sample = samples.value.find(s => String(s.id) === String(selectedSampleId.value));
    if (sample) drawSingleFlow(projection, sample);
    return;
  }

  // B. 区域模式 (聚合流向)
  if (clickedDistrict.value) {
    const targetName = clickedDistrict.value;
    const linkMap = new Map(); 
    const nodesMap = new Map();

    // 遍历所有样本 (因为移除了筛选框，所以直接用 samples)
    if (!samples.value) return;

    samples.value.forEach(sample => {
        const ctx = context.value[sample.id];
        if (!ctx) return;

        const pName = ctx.farmers?.[0] || "";
        const mName = ctx.markets?.[0] || "";
        const isRisk = sample.riskLevel !== '低风险';

        const pLoc = getSmartLocation(pName);
        const mLoc = getSmartLocation(mName);

        const isRelated = 
            (pLoc.name === targetName || pName.includes(targetName)) ||
            (mLoc.name === targetName || mName.includes(targetName));

        if (isRelated) {
            const src = projection(pLoc.coord);
            const tgt = projection(mLoc.coord);
            
            const key = `${src[0].toFixed(0)},${src[1].toFixed(0)}-${tgt[0].toFixed(0)},${tgt[1].toFixed(0)}`;
            
            if (!linkMap.has(key)) {
                linkMap.set(key, { 
                    src, tgt, count: 0, 
                    isRisk: false, 
                    pName: pLoc.name, mName: mLoc.name 
                });
            }
            const link = linkMap.get(key);
            link.count++;
            if (isRisk) link.isRisk = true;

            const pKey = `${src[0].toFixed(0)},${src[1].toFixed(0)}`;
            const mKey = `${tgt[0].toFixed(0)},${tgt[1].toFixed(0)}`;
            nodesMap.set(pKey, { x: src[0], y: src[1], name: pLoc.name, type: 'producer', risk: link.isRisk });
            nodesMap.set(mKey, { x: tgt[0], y: tgt[1], name: mLoc.name, type: 'market', risk: link.isRisk });
        }
    });

    // 绘制聚合线
    linkMap.forEach(link => {
        drawAggregatedPath(link);
    });

    // 绘制节点 (形状区分)
    nodesMap.forEach(node => {
        drawNodeShape(flowGroup, node.x, node.y, node.type, node.risk, false);
    });
  }
};

const drawAggregatedPath = (link) => {
    const { src, tgt, isRisk, count } = link;
    const dx = tgt[0]-src[0], dy = tgt[1]-src[1], dr = Math.sqrt(dx*dx+dy*dy);
    if (dr < 1) return; 

    const pathD = `M${src[0]},${src[1]}A${dr*1.3},${dr*1.3} 0 0,1 ${tgt[0]},${tgt[1]}`;
    const color = isRisk ? '#d32f2f' : '#1976d2';
    const width = Math.min(8, Math.max(1.5, Math.log(count + 1) * 2)); 
    
    flowGroup.append('path')
        .attr('d', pathD).attr('fill','none')
        .attr('stroke', color).attr('stroke-width', width)
        .attr('opacity', 0.7)
        .on('mouseover', (e) => {
            showTooltip(e, `路径流量: <b>${count}</b> 样本<br>包含风险: ${isRisk?'是':'否'}`);
            d3.select(e.target).attr('stroke-width', width + 2).attr('opacity', 1);
        })
        .on('mouseout', (e) => {
            hideTooltip();
            d3.select(e.target).attr('stroke-width', width).attr('opacity', 0.8);
        });

    if (isRisk && count > 5) {
        const p = flowGroup.append('circle').attr('r', 2).attr('fill', '#fff');
        p.append('animateMotion').attr('dur', '2s').attr('repeatCount', 'indefinite').attr('path', pathD);
    }
};

const drawSingleFlow = (projection, sample) => {
  const ctx = context.value[sample.id];
  if (!ctx) return;
  
  const isRisk = sample.riskLevel !== '低风险';
  const pLoc = getSmartLocation(ctx.farmers?.[0]);
  const mLoc = getSmartLocation(ctx.markets?.[0]);
  
  const src = projection(pLoc.coord);
  const tgt = projection(mLoc.coord);
  const dx = tgt[0]-src[0], dy = tgt[1]-src[1], dr = Math.sqrt(dx*dx+dy*dy);
  const pathD = `M${src[0]},${src[1]}A${dr*1.3},${dr*1.3} 0 0,1 ${tgt[0]},${tgt[1]}`;
  const color = isRisk ? '#d32f2f' : '#1976d2';

  // 绘制线
  flowGroup.append('path')
    .attr('d', pathD).attr('fill','none')
    .attr('stroke', color).attr('stroke-width', 3)
    .attr('filter', 'url(#glow)');

  // 粒子动画
  const p = flowGroup.append('circle').attr('r', 3).attr('fill', '#fff');
  p.append('animateMotion').attr('dur', '1.5s').attr('repeatCount', 'indefinite').attr('path', pathD);

  // 绘制起点 (Producer: Circle)
  drawNodeShape(flowGroup, src[0], src[1], 'producer', isRisk, true);
  
  // 绘制终点 (Market: Square)
  drawNodeShape(flowGroup, tgt[0], tgt[1], 'market', isRisk, true);
};

// --- 通用节点形状绘制 ---
const drawNodeShape = (container, x, y, type, isRisk, isFocus) => {
  const color = isRisk ? (isFocus ? '#d32f2f' : '#ef5350') : (type === 'producer' ? '#67c23a' : '#409eff');
  const size = isFocus ? 10 : 6;
  
  const group = container.append('g')
    .attr('class', 'node-shape')
    // 初始位置，缩放逻辑在 zoom handler 中处理 transform scale
    .attr('transform', `translate(${x},${y})`)
    .datum({ x, y, isFocus }); // 绑定数据供 zoom 使用

  if (type === 'producer') {
    // 养殖户：圆形
    group.append('circle')
      .attr('r', size / 2)
      .attr('fill', color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1);
  } else {
    // 市场：正方形
    group.append('rect')
      .attr('x', -size / 2)
      .attr('y', -size / 2)
      .attr('width', size)
      .attr('height', size)
      .attr('fill', color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1);
  }
};

const defineDefs = (svg) => {
  const defs = svg.append('defs');
  const f = defs.append("filter").attr("id","glow");
  f.append("feGaussianBlur").attr("stdDeviation","2").attr("result","coloredBlur");
  const m = f.append("feMerge");
  m.append("feMergeNode").attr("in","coloredBlur");
  m.append("feMergeNode").attr("in","SourceGraphic");
};

const resetView = () => {
  clickedDistrict.value = null;
  store.selectedSampleId = null;
};

const showTooltip = (e, html) => {
  const t = d3.select(tooltipRef.value);
  t.style('opacity',1).html(html).style('left',(e.offsetX+15)+'px').style('top',(e.offsetY+15)+'px');
};
const hideTooltip = () => d3.select(tooltipRef.value).style('opacity',0);

// 监听
watch([samples, selectedSampleId, clickedDistrict], () => {
  if (svg) {
     const w=mapRef.value.clientWidth, h=mapRef.value.clientHeight;
     const proj = d3.geoMercator().fitExtent([[20,20],[w-20,h-20]], geoDistrictData);
     
     calculateStats(); // 重新计算热力
     renderHeatmap(d3.geoPath().projection(proj));
     updateFlows(proj);
  }
});

onMounted(() => {
  fetchGeoJson();
  window.addEventListener('resize', () => drawMap());
});
onUnmounted(() => window.removeEventListener('resize', drawMap));
</script>

<style scoped>
.map-container { position: relative; width: 100%; height: 100%; overflow: hidden; background: #fff; font-family: 'Arial', sans-serif; }
.map { width: 100%; height: 100%; cursor: pointer; }

.map-header { position: absolute; top: 15px; left: 20px; pointer-events: none; z-index: 10; }
.title { font-size: 16px; font-weight: 700; color: #333; letter-spacing: 1px; }
.subtitle { margin-top: 6px; }
.mode-tag { font-size: 10px; padding: 3px 8px; border-radius: 4px; font-weight: bold; display: inline-block; }
.mode-tag.macro { background: #e3f2fd; color: #1565c0; border: 1px solid #90caf9; }
.mode-tag.focus { background: #ffebee; color: #c62828; border: 1px solid #ef9a9a; }
.mode-tag.region { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }

/* 图例 */
.legend-panel { position: absolute; bottom: 20px; right: 20px; background: rgba(255,255,255,0.95); border: 1px solid #eee; padding: 12px; border-radius: 4px; pointer-events: none; }
.legend-title { font-size: 10px; font-weight: bold; color: #555; margin-bottom: 5px; }
.legend-gradient { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #888; }
.grad-bar { width: 80px; height: 6px; background: linear-gradient(to right, #f9fafb, #b71c1c); border-radius: 3px; border: 1px solid #eee; }
.legend-divider { height: 1px; background: #eee; margin: 8px 0; }
.legend-item { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #555; margin-bottom: 4px; }
.line { width: 20px; height: 2px; display: inline-block; }
.line.risk { background: #d32f2f; }
.line.safe { background: #1976d2; }

/* 形状图例 */
.shape-circle { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.shape-rect { width: 8px; height: 8px; display: inline-block; }
.producer { background: #67c23a; }
.market { background: #409eff; }

.tooltip { position: absolute; pointer-events: none; background: rgba(0,0,0,0.8); color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 11px; z-index: 999; }
</style>