<!-- <template>
  <div class="map-container">
    <div class="dropdown-container">
      <select v-model="selectedLocationType" @change="selectAttribute">
        <option value="" disabled>选择省份类型</option>
        <option value="production_location">食品产地</option>
        <option value="sale_location">食品销售地</option>
      </select>

      <select v-model="selectedAttribute" @change="selectAttribute">
        <option value="" disabled>选择热力图属性</option>
        <option value="adulterant_category">污染物类别</option>
        <option value="food_category">食品类别</option>
        <option value="grade">食品风险等级</option>
      </select>

      <select v-if="selectedAttribute === 'adulterant_category'" v-model="selectedAdulterant" @change="selectAttribute">
        <option v-for="option in adulterantOptions" :key="option" :value="option">{{ option }}</option>
      </select>

      <select v-if="selectedAttribute === 'food_category'" v-model="selectedFoodCategory" @change="selectAttribute">
        <option v-for="option in foodCategoryOptions" :key="option" :value="option">{{ option }}</option>
      </select>
    </div>

    <div ref="map" class="map"></div>
    
    <button 
      v-if="showResetButton" 
      class="reset-button" 
      @click="resetChart">
      还原
    </button>
  </div>
</template>

<script>
import * as d3 from 'd3';
import axios from 'axios';
import PubSub from 'pubsub-js'; // 确保安装了 npm install pubsub-js

export default {
  name: 'ChinaMap',
  data() {
    return {
      allData: [], // ❗修正1：初始化为空数组，而不是对象 {}
      showResetButton: false,
      initialTransform: d3.zoomIdentity,
      provinceGrades: {},
      cityGrades: {},
      provinceAdulterant: {},
      provinceAdulterantCount: {},
      cityAdulterant: {},
      cityAdulterantCount: {},
      provinceFoodCategory: {},
      provinceFoodCategoryCount: {},
      cityFoodCategory: {},
      cityFoodCategoryCount: {},
      colorScale: null,
      lineData: {},
      selectedLocationType: 'production_location',
      selectedAttribute: 'grade',
      selectedAdulterant: null,
      selectedFoodCategory: null,
      adulterantOptions: [],
      foodCategoryOptions: [],
      provinceStats: [],
      count: 0,
    };
  },
  // ❗修正2：移除了导致报错的 computed 属性
  mounted() {
    // 防止重复订阅
    this.pubSubToken = PubSub.subscribe("ban-chinamap", () => {
      this.count++;
    });

    if (!this.count) {
      this.processCSVData();
    }
    window.addEventListener('resize', this.fetchGeoJson);
  },
  beforeDestroy() {
    if (this.pubSubToken) {
      PubSub.unsubscribe(this.pubSubToken);
    }
    window.removeEventListener('resize', this.fetchGeoJson);
  },
  methods: {
    async fetchGeoJson() {
      try {
        if (!this.count) {
          // ❗注意：如果外网访问慢，建议把 china.json 下载到 public 目录并改为 axios.get('china.json')
          const response = await axios.get('https://geojson.cn/api/china/1.5.2/china.json');
          console.log("调用中国地图轮廓");
          const chinaGeoJson = response.data;
          this.drawMap(chinaGeoJson);
        }
      } catch (error) {
        console.error('Error fetching GeoJSON data:', error);
      }
    },
    async processAdulterantCategory() {
      if (!this.allData || this.allData.length === 0) return; // 安全检查

      console.log("选来哪个属性值？", this.selectedAdulterant);
      
      const provinceData = d3.group(this.allData, d => {
        if (this.selectedLocationType === 'production_location') return d.production_location;
        if (this.selectedLocationType === 'sale_location') return d.sale_location;
      });

      provinceData.forEach((samples, province) => {
        const totalSamples = samples.length;
        this.provinceAdulterantCount[province] = samples.filter(d => d.adulterant_category === this.selectedAdulterant).length;
        this.provinceAdulterant[province] = this.provinceAdulterantCount[province] / totalSamples;
      });

      const cityData = d3.group(this.allData, d => {
        if (this.selectedLocationType === 'production_location') return d.production_location2;
        if (this.selectedLocationType === 'sale_location') return d.sale_location2;
      });

      cityData.forEach((samples, city) => {
        const totalSamples = samples.length;
        this.cityAdulterantCount[city] = samples.filter(d => d.adulterant_category === this.selectedAdulterant).length;
        this.cityAdulterant[city] = this.cityAdulterantCount[city] / totalSamples;
      });
    },
    async processFoodCategory() {
      if (!this.allData || this.allData.length === 0) return;

      console.log("选来哪个属性值？", this.selectedFoodCategory);
      
      const provinceData = d3.group(this.allData, d => {
        if (this.selectedLocationType === 'production_location') return d.production_location;
        if (this.selectedLocationType === 'sale_location') return d.sale_location;
      });

      provinceData.forEach((samples, province) => {
        const totalSamples = samples.length;
        this.provinceFoodCategoryCount[province] = samples.filter(d => d.food_category === this.selectedFoodCategory).length;
        this.provinceFoodCategory[province] = this.provinceFoodCategoryCount[province] / totalSamples;
      });

      const cityData = d3.group(this.allData, d => {
        if (this.selectedLocationType === 'production_location') return d.production_location2;
        if (this.selectedLocationType === 'sale_location') return d.sale_location2;
      });

      cityData.forEach((samples, city) => {
        const totalSamples = samples.length;
        this.cityFoodCategoryCount[city] = samples.filter(d => d.food_category === this.selectedFoodCategory).length;
        this.cityFoodCategory[city] = this.cityFoodCategoryCount[city] / totalSamples;
      });
    },
    selectAttribute() {
      if (this.selectedAttribute === 'grade') this.processCSVData();
      else {
        if (this.selectedAdulterant !== null || this.selectedFoodCategory !== null) this.processCSVData();
      }
    },
    async processCSVData() {
      try {
        // 确保文件都在 public 目录下
        this.allData = await d3.csv('graph_data.csv');
        console.log("数据加载成功，长度:", this.allData.length);

        const adulterantData = await d3.csv('adulterant_category.csv');
        this.adulterantOptions = adulterantData.map(item => item.unique_adulterant_category);
        
        const foodCategoryData = await d3.csv('food_categories.csv');
        this.foodCategoryOptions = foodCategoryData.map(item => item.unique_food_categories);
        
        // 默认值设置，防止为空
        if (!this.selectedAdulterant && this.adulterantOptions.length > 0) {
            this.selectedAdulterant = this.adulterantOptions[0];
        }
        if (!this.selectedFoodCategory && this.foodCategoryOptions.length > 0) {
            this.selectedFoodCategory = this.foodCategoryOptions[0];
        }

        if (this.selectedAttribute === 'adulterant_category') {
          this.processAdulterantCategory();
        }
        if (this.selectedAttribute === 'food_category') {
          this.processFoodCategory();
        }

        // 初始化统计对象
        const provinceStats = {};
        this.allData.forEach((d) => {
          const productionLocation = d.production_location;
          const saleLocation = d.sale_location;
          // 统计产地数量
          if (productionLocation) {
            if (!provinceStats[productionLocation]) {
              provinceStats[productionLocation] = { productionCount: 0, saleCount: 0 };
            }
            provinceStats[productionLocation].productionCount++;
          }
          // 统计销售地数量
          if (saleLocation) {
            if (!provinceStats[saleLocation]) {
              provinceStats[saleLocation] = { productionCount: 0, saleCount: 0 };
            }
            provinceStats[saleLocation].saleCount++;
          }
        });

        this.provinceStats = Object.entries(provinceStats).map(([province, counts]) => ({
          province,
          productionCount: counts.productionCount,
          saleCount: counts.saleCount,
        }));

        // 按省份统计平均 grade
        const provinceData = d3.group(this.allData, d => {
          if (this.selectedLocationType === 'production_location') return d.production_location;
          if (this.selectedLocationType === 'sale_location') return d.sale_location;
        });
        const provinceGrades = {};
        provinceData.forEach((rows, province) => {
          const grades = rows.map(d => +d.grade).filter(g => !isNaN(g));
          if (grades.length > 0) {
            provinceGrades[province] = d3.mean(grades);
          }
        });

        // 按市统计平均 grade
        const cityData = d3.group(this.allData, d => {
          if (this.selectedLocationType === 'production_location') return d.production_location2;
          if (this.selectedLocationType === 'sale_location') return d.sale_location2;
        });
        const cityGrades = {};
        cityData.forEach((rows, city) => {
          const grades = rows.map(d => +d.grade).filter(g => !isNaN(g));
          if (grades.length > 0) {
            cityGrades[city] = d3.mean(grades);
          }
        });

        this.provinceGrades = provinceGrades;
        this.cityGrades = cityGrades;
        
        let allGrades = [];
        if (this.selectedAttribute === 'grade') {
          allGrades = [...Object.values(provinceGrades)];
        } else if (this.selectedAttribute === 'adulterant_category') {
          allGrades = [...Object.values(this.provinceAdulterant)];
        } else if (this.selectedAttribute === 'food_category') {
          allGrades = [...Object.values(this.provinceFoodCategory)];
        }

        // 防止 allGrades 为空导致 d3.min/max 报错
        if (allGrades.length === 0) allGrades = [0, 1]; 

        const min = d3.min(allGrades);
        const max = d3.max(allGrades);
        const mid = (min + max) / 5 * 2;

        this.colorScale = d3.scaleLinear()
          .domain([min, mid, max])
          .range(['#fdf8ed', '#d67a7a', '#872e25']);

        // 统计连线信息
        const lineData = {};
        this.allData.forEach(row => {
          const provinceFrom = row.production_location;
          const cityFrom = row.production_location2;
          const provinceTo = row.sale_location;
          const cityTo = row.sale_location2;

          const isSameProvince = provinceFrom === provinceTo;

          const provinceKey = `${provinceFrom} -> ${provinceTo}`;
          if (!lineData[provinceKey]) lineData[provinceKey] = 0;
          lineData[provinceKey] += 1;

          const cityKey = `${cityFrom} -> ${cityTo}`;
          if (!lineData[cityKey]) lineData[cityKey] = 0;
          lineData[cityKey] += 1;

          if (!isSameProvince) {
            if (provinceFrom && cityTo) {
              const k = `${provinceFrom} -> ${cityTo}`;
              if (!lineData[k]) lineData[k] = 0;
              lineData[k] += 1;
            }
            if (cityFrom && provinceTo) {
              const k = `${cityFrom} -> ${provinceTo}`;
              if (!lineData[k]) lineData[k] = 0;
              lineData[k] += 1;
            }
          }
        });

        this.lineData = lineData;
        this.fetchGeoJson();

      } catch (error) {
        console.error('Error loading CSV data:', error);
      }
    },
    resetChart() {
      const mapElement = this.$refs.map;
      const svg = d3.select(mapElement).select("svg");
      svg.transition().duration(300).call(
        this.zoom.transform,
        d3.zoomIdentity
      );
      this.showResetButton = false;
    },
    drawMap(geoData) {
      const mapElement = this.$refs.map;
      d3.select(mapElement).select("svg").remove();
      const { width, height } = mapElement.getBoundingClientRect();
      const svg = d3.select(this.$refs.map)
        .append('svg')
        .attr('width', width)
        .attr('height', height);

      const zoomLayer = svg.append('g').attr('class', 'zoom-layer');

      const projection = d3.geoMercator()
        .center([104, 38])
        .scale(600)
        .translate([width / 2, height / 2]);

      const tooltip = d3.select(this.$refs.map)
        .append("div")
        .attr("class", "tooltip")
        .style("opacity", 0)
        .style("position", "absolute")
        .style("background", "black")
        .style("color", "white")
        .style("padding", "5px")
        .style("border-radius", "4px")
        .style("z-index", "1000");

      const path = d3.geoPath().projection(projection);

      zoomLayer.selectAll('path')
        .data(geoData.features)
        .enter()
        .append('path')
        .attr("class", "province-path")
        .attr('d', path)
        .attr('stroke', '#333')
        .attr('fill', d => {
          const provinceName = d.properties.fullname || d.properties.name;
          let grade;
          if (this.selectedAttribute === 'grade') {
            grade = this.provinceGrades[provinceName];
          } else if (this.selectedAttribute === 'adulterant_category') {
            grade = this.provinceAdulterant[provinceName];
          } else if (this.selectedAttribute === 'food_category') {
            grade = this.provinceFoodCategory[provinceName];
          }
          
          if (grade === undefined) return '#ccc';
          return grade === 0 ? '#fffff2' : this.colorScale(grade);
        })
        .on('mouseover', (event, d) => {
          const provinceName = d.properties.fullname;
          // 安全获取数据
          const grade = this.selectedAttribute === 'grade' ? this.provinceGrades[provinceName] : 
                       this.selectedAttribute === 'adulterant_category' ? this.provinceAdulterant[provinceName] :
                       this.provinceFoodCategory[provinceName];
          
          let content = `省份: ${provinceName}<br>平均风险值: ${grade !== undefined ? grade.toFixed(2) : '无数据'}`;
          
          if (this.selectedAttribute === 'adulterant_category') {
              const count = this.provinceAdulterantCount[provinceName] || 0;
              content = `省份: ${provinceName}<br>${this.selectedAdulterant}占比: ${(grade||0).toFixed(2)}<br>数量: ${count}`;
          } else if (this.selectedAttribute === 'food_category') {
              const count = this.provinceFoodCategoryCount[provinceName] || 0;
              content = `省份: ${provinceName}<br>${this.selectedFoodCategory}占比: ${(grade||0).toFixed(2)}<br>数量: ${count}`;
          }

          tooltip.style('opacity', 1).html(content);
          d3.select(event.target).attr('stroke-width', 2).attr('stroke', '#39406c');
        })
        .on('mousemove', (event) => {
          tooltip
            .style('left', `${event.layerX + 10}px`)
            .style('top', `${event.layerY - 20}px`);
        })
        .on('mouseout', (event) => {
          tooltip.style('opacity', 0);
          d3.select(event.target).attr('stroke-width', 1).attr('stroke', '#333');
        })
        .on('click', (event, d) => {
          this.handleProvinceClick(d);
        });

      this.drawTransportRoutes(zoomLayer, geoData, projection);

      const zoom = d3.zoom()
        .scaleExtent([0.5, 10])
        .on("zoom", (event) => {
          zoomLayer.attr("transform", event.transform);
          const isAtInitialTransform =
            event.transform.k === this.initialTransform.k &&
            event.transform.x === this.initialTransform.x &&
            event.transform.y === this.initialTransform.y;

          this.showResetButton = !isAtInitialTransform;

          if (event.transform.k >= 2) {
            this.checkProvincesInView(zoomLayer, path, mapElement);
          } else {
            this.clearCityBorders(zoomLayer);
          }
        });
      
      this.zoom = zoom;
      d3.select(mapElement).select("svg").call(zoom);
    },
    drawTransportRoutes(svg, geoData, projection) {
      const rawLineData = this.lineData || {};
      const lineData = Object.entries(rawLineData).map(([key, weight]) => {
        const [from, to] = key.split(' -> ');
        return { from, to, weight };
      });

      const provinceCenters = {};
      geoData.features.forEach(feature => {
        const provinceName = feature.properties.fullname;
        const center = feature.properties.center;
        if (provinceName && center) {
          provinceCenters[provinceName] = projection(center);
        }
      });

      const pinnedProvinces = new Set();

      svg.selectAll('circle.province-center')
        .data(Object.entries(provinceCenters))
        .enter()
        .append('circle')
        .attr('class', 'province-center')
        .attr('cx', d => d[1][0])
        .attr('cy', d => d[1][1])
        .attr('r', ([province]) => {
            const countType = this.selectedLocationType === 'sale_location' ? 'saleCount' : 'productionCount';
            const count = this.provinceStats.find((item) => item.province === province)?.[countType] || 0;
            return Math.sqrt(count) * 0.5 || 2; // 最小半径2
        })
        .attr('fill', '#39406c')
        .attr('opacity', 0.7)
        .on('mouseover', (event, [province]) => {
           const countType = this.selectedLocationType === 'sale_location' ? 'saleCount' : 'productionCount';
           const countLabel = this.selectedLocationType === 'sale_location' ? '食品销售量' : '食品产量';
           const count = this.provinceStats.find((item) => item.province === province)?.[countType] || 0;
           
           this.showRoutes(svg, province, lineData, provinceCenters, pinnedProvinces);
           d3.select(event.target).attr('fill', '#8d78b5');
           this.showTooltip(event, `${province}<br>${countLabel}: ${count}`);
        })
        .on('mousemove', (event) => {
           this.updateTooltipPosition(event);
        })
        .on('mouseout', (event, [province]) => {
           if (!pinnedProvinces.has(province)){
             d3.select(event.target).attr('fill', '#39406c');
           }
           this.hideRoutes(svg, pinnedProvinces);
           this.hideTooltip();
        })
        .on('click', (event, [province]) => {
           if (pinnedProvinces.has(province)) {
             pinnedProvinces.delete(province);
             this.hideRoutes(svg, pinnedProvinces);
           } else {
             pinnedProvinces.add(province);
             this.showRoutes(svg, province, lineData, provinceCenters, pinnedProvinces);
           }
        });
    },
    showRoutes(svg, province, lineData, provinceCenters, pinnedProvinces){
       const relatedRoutes = lineData.filter(
         route => (route.from === province || route.to === province) && 
                  provinceCenters[route.from] && provinceCenters[route.to]
       );

       let originalPaths = svg.selectAll('path.transport-route').data();
       let existingRoutes = originalPaths.map(d => `${d.from}-${d.to}`);
       let uniqueRoutes = relatedRoutes.filter(d => !existingRoutes.includes(`${d.from}-${d.to}`));
       let allRoutes = originalPaths.concat(uniqueRoutes);

       let defs = svg.select('defs');
       if (defs.empty()) defs = svg.append('defs');

       defs.selectAll('linearGradient')
         .data(allRoutes)
         .join('linearGradient')
         .attr('id', (d, i) => `gradient-hover-${province}-${i}`) // 使用索引作为唯一ID的一部分
         .attr('gradientUnits', 'userSpaceOnUse')
         .attr('x1', d => provinceCenters[d.from][0])
         .attr('y1', d => provinceCenters[d.from][1])
         .attr('x2', d => provinceCenters[d.to][0])
         .attr('y2', d => provinceCenters[d.to][1])
         .each(function () {
            const gradient = d3.select(this);
            gradient.selectAll('stop').remove();
            gradient.append('stop').attr('offset', '30%').attr('stop-color', '#6e4869').attr('stop-opacity', 1);
            gradient.append('stop').attr('offset', '100%').attr('stop-color', '#ecf6f9').attr('stop-opacity', 1);
         });

       const that = this;
       svg.selectAll('path.transport-route')
         .data(allRoutes)
         .join('path') // 使用 join 自动处理 enter/update/exit
         .attr('class', 'transport-route')
         .attr('d', d => {
            const [x1, y1] = provinceCenters[d.from];
            const [x2, y2] = provinceCenters[d.to];
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dr = Math.sqrt(dx * dx + dy * dy) * 1.2;
            return `M${x1},${y1}A${dr},${dr} 0 0,1 ${x2},${y2}`;
         })
         .attr('stroke', (d, i) => `url(#gradient-hover-${province}-${i})`)
         .attr('stroke-width', d => Math.log(d.weight * 3 + 1) + 0.2)
         .attr('fill', 'none')
         .attr('opacity', 0.7)
         .on('mouseover', function(event, d) {
            if (pinnedProvinces.has(d.from) || pinnedProvinces.has(d.to)) {
               d3.select(this).attr('stroke', '#BB6600').attr('opacity', 1);
               that.showTooltip(event, `从 ${d.from} 到 ${d.to}<br>运输量: ${d.weight}`);
            }
         })
         .on('mousemove', (event) => that.updateTooltipPosition(event))
         .on('mouseout', function(event, d) {
            // 重新应用原来的渐变色，避免索引报错
            const idx = allRoutes.indexOf(d); 
            if(idx > -1) {
               d3.select(this)
                 .attr('stroke', `url(#gradient-hover-${province}-${idx})`)
                 .attr('opacity', 0.7);
            }
            that.hideTooltip();
         });
    },
    hideRoutes(svg, pinnedProvinces) {
       svg.selectAll('path.transport-route')
         .filter(d => !pinnedProvinces.has(d.from) && !pinnedProvinces.has(d.to))
         .remove();
    },
    showTooltip(event, content) {
      d3.select(this.$refs.map).select('.tooltip').style('opacity', 1).html(content);
    },
    updateTooltipPosition(event) {
      d3.select(this.$refs.map).select('.tooltip')
        .style('left', `${event.layerX + 10}px`)
        .style('top', `${event.layerY - 20}px`);
    },
    hideTooltip() {
      d3.select(this.$refs.map).select('.tooltip').style('opacity', 0);
    },
    checkProvincesInView(svg, path, mapElement) {
       // 这里保留你原来的逻辑，只需确保 axios 引入
       const { width, height } = mapElement.getBoundingClientRect();
       svg.selectAll("path.province-path").each((d, i, nodes) => {
          const node = nodes[i];
          const box = node.getBoundingClientRect();
          const mapBox = mapElement.getBoundingClientRect();
          const inView = (box.left >= mapBox.left && box.right <= mapBox.right && 
                          box.top >= mapBox.top && box.bottom <= mapBox.bottom);
          
          if (inView && d.properties.filename) {
              // 防止频繁请求，实际项目中应加缓存
              axios.get(`https://geojson.cn/api/china/1.5.2/${d.properties.filename}.json`)
                  .then(res => {
                      if (d3.select(mapElement).select("svg").node().__zoom.k > 2) {
                          this.drawCityBorders(res.data, svg, path);
                      }
                  }).catch(e => console.error(e));
          } else {
              this.clearCityBorders(svg);
          }
       });
    },
    clearCityBorders(svg) {
      svg.selectAll('.city-borders').remove();
    },
// 在省份的轮廓内绘制市的轮廓，并上色
    drawCityBorders(provinceGeoJson, svg, path) {
      let group = svg.select('.city-borders');
      // 确保市级图层在省级图层之上，但在文字标签之下（如果有的话）
      if (group.empty()) group = svg.append('g').attr('class', 'city-borders');

      const tooltip = d3.select(this.$refs.map).select('.tooltip');

      group.selectAll('path')
        .data(provinceGeoJson.features)
        .join('path')
        .attr('d', d => path(d.geometry))
        .attr('stroke', '#999') // 市界线颜色稍微淡一点
        .attr('stroke-width', 0.5)
        .attr('fill', d => {
          const cityName = d.properties.fullname || d.properties.name;
          
          // --- 核心上色逻辑 ---
          let value;
          if (this.selectedAttribute === 'grade') {
            value = this.cityGrades[cityName];
          } else if (this.selectedAttribute === 'adulterant_category') {
            value = this.cityAdulterant[cityName];
          } else if (this.selectedAttribute === 'food_category') {
            value = this.cityFoodCategory[cityName];
          }

          // 如果没有数据，显示浅灰色；如果值为0（如占比0），显示特定的浅色；否则走颜色比例尺
          if (value === undefined || value === null) return 'rgba(255,255,255,0.1)'; // 无数据透明，露出底下的省份颜色
          return value === 0 ? '#fffff2' : this.colorScale(value);
        })
        // --- 交互逻辑 ---
        .on('mouseover', (event, d) => {
           const cityName = d.properties.fullname;
           // 获取对应数据
           let value;
           let label = "平均风险值";
           let count = 0;

           if (this.selectedAttribute === 'grade') {
             value = this.cityGrades[cityName];
           } else if (this.selectedAttribute === 'adulterant_category') {
             value = this.cityAdulterant[cityName];
             count = this.cityAdulterantCount[cityName];
             label = `${this.selectedAdulterant}占比`;
           } else if (this.selectedAttribute === 'food_category') {
             value = this.cityFoodCategory[cityName];
             count = this.cityFoodCategoryCount[cityName];
             label = `${this.selectedFoodCategory}占比`;
           }

           // 构建提示框内容
           let content = `城市: ${cityName}<br>${label}: ${value !== undefined ? value.toFixed(2) : '无数据'}`;
           if (count > 0) {
             content += `<br>样本数量: ${count}`;
           }

           tooltip.style('opacity', 1).html(content);
           
           // 高亮样式
           d3.select(event.target)
             .attr('stroke', '#39406c')
             .attr('stroke-width', 2);
        })
        .on('mousemove', (event) => {
           tooltip
            .style('left', `${event.layerX + 10}px`)
            .style('top', `${event.layerY - 20}px`);
        })
        .on('mouseout', (event) => {
           tooltip.style('opacity', 0);
           d3.select(event.target)
             .attr('stroke', '#999')
             .attr('stroke-width', 0.5);
        });
    },
    handleProvinceClick(provinceData) {
      console.log('Clicked:', provinceData);
      this.$emit('province-selected', provinceData);
    }
  },
};
</script>

<style scoped>
/* 1. 强制设置背景色为纯白 */
.map-container {
  position: relative;
  width: 100%;
  height: 100%; /* 建议改为 100% 占满父容器 */
  overflow: hidden;
  background-color: #ffffff !important; /* [关键修复] 强制白底 */
}

.map {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.dropdown-container {
  position: absolute;
  top: 15px;
  left: 15px;
  z-index: 1000;
  /* 背景半透明模糊，像毛玻璃 */
  background: rgba(255, 255, 255, 0.85); 
  backdrop-filter: blur(4px);
  padding: 8px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1); /* 加点阴影 */
}

select {
  padding: 6px;
  border-radius: 4px;
  border: 1px solid #e0e0e0;
  background: #fff;
  font-size: 12px;
  color: #333;
  outline: none;
}

.reset-button {
  position: absolute;
  width: 100px;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  padding: 3px 3px;
  background-color: #ffffff70;
  color: rgb(39, 39, 39);
  border: 5px solid rgb(235, 187, 31);
  border-radius: 50px;
  cursor: pointer;
  display: block;
}
</style> -->

<script setup lang="ts">
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { GraphChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  ToolboxComponent
} from 'echarts/components';
import VChart, { THEME_KEY } from 'vue-echarts';
import { ref, onMounted, computed, provide, onUnmounted } from 'vue';
import { Search, Refresh, FullScreen, VideoPause, VideoPlay, Aim } from '@element-plus/icons-vue';

use([CanvasRenderer, GraphChart, TitleComponent, TooltipComponent, LegendComponent, ToolboxComponent]);
provide(THEME_KEY, 'light');

const chartInstance = ref<any>(null);
const explorerWrapperRef = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);
const isPaused = ref(false); 
const loading = ref(true);
const searchQuery = ref('');
const graphData = ref<any>({ nodes: [], links: [], categories: [] });

const CATEGORY_COLOR_MAP: Record<string, string> = {
  '检测样本': '#ef4444', 
  '农贸市场': '#409eff', 
  '养殖户': '#67c23a',   
  '水产品': '#e6a23c',   
  '污染物': '#909399'    
};

const chartOption = computed(() => {
  return {
    backgroundColor: '#ffffff',
    title: {
      text: '全域风险关联图谱 (全量数据)',
      subtext: `当前节点数: ${graphData.value.nodes.length} | 边数: ${graphData.value.links.length}`,
      top: 20,
      left: 20,
      textStyle: { fontSize: 16, fontWeight: 'bold', color: '#333' }
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,0.95)',
      textStyle: { color: '#333' },
      formatter: (params: any) => {
        if (params.dataType === 'edge') {
          return `${params.data.source} <span style="color:#ccc">--</span> ${params.data.target}`;
        }
        const d = params.data;
        return `
          <div style="font-weight:bold;border-bottom:1px solid #eee;padding-bottom:4px;margin-bottom:4px">${d.name}</div>
          <div>ID: <span style="font-family:monospace">${d.id}</span></div>
          <div>类型: ${d.category}</div>
        `;
      }
    },
    legend: {
      data: graphData.value.categories.map((a: any) => a.name),
      bottom: 20,
      left: 'center',
      itemGap: 20,
      selectedMode: true 
    },
    series: [
      {
        name: 'Risk Graph',
        type: 'graph',
        layout: 'force',
        data: graphData.value.nodes,
        links: graphData.value.links,
        categories: graphData.value.categories,
        
        roam: true,        
        draggable: true,   
        zoom: 0.4,      // 缩小视野，以便看到全貌   
        
        // [性能优化] 开启渐进式渲染，防止几千个点直接卡死浏览器
        progressiveThreshold: 500,
        progressive: 200,
        
        label: {
          show: false, 
          position: 'right',
          formatter: '{b}',
          color: '#333'
        },
        
        lineStyle: {
          color: '#ccc',
          curveness: 0.1,
          opacity: 0.1,  // 线条更淡一点，因为线太多了
          width: 0.3
        },
        
        force: {
          initLayout: 'circular',
          repulsion: 2000,        // [关键] 更大的斥力，因为点太多了
          gravity: 0.1,           // 稍大的引力，防止边缘节点飞太远
          edgeLength: [50, 300],
          
          // 默认关闭动画 (预计算布局)，保证一出来就是一张铺开的大网
          // 如果开启 true，上万个点的实时计算会让浏览器掉帧严重
          layoutAnimation: !isPaused.value,
          friction: isPaused.value ? 1.0 : 0.6
        },
        
        emphasis: {
          focus: 'adjacency', 
          lineStyle: { width: 2, color: 'source', opacity: 1 },
          label: {
            show: true,
            fontWeight: 'bold',
            fontSize: 12,
            backgroundColor: 'rgba(255,255,255,0.8)',
            padding: [2, 4],
            borderRadius: 2
          },
          itemStyle: {
            borderColor: '#000',
            borderWidth: 1,
            shadowBlur: 10,
            shadowColor: 'rgba(0,0,0,0.3)'
          }
        }
      }
    ]
  };
});

const loadData = async () => {
  loading.value = true;
  try {
    const res = await fetch('/api_data_risk_network.json');
    const data = await res.json();
    
    // [修改] 移除所有过滤逻辑，全量加载
    const allNodes = data.nodes.map((n: any) => {
      // 依然保留大节点的默认标签显示
      if (n.symbolSize > 15) {
        return { ...n, label: { show: true, fontSize: 10, color: '#333' } };
      }
      return n;
    });

    const categoriesWithColor = data.categories.map((c: any) => ({
      name: c.name,
      itemStyle: { color: CATEGORY_COLOR_MAP[c.name] || '#ccc' }
    }));

    graphData.value = {
      nodes: allNodes,
      links: data.links,
      categories: categoriesWithColor
    };
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const togglePause = () => {
  isPaused.value = !isPaused.value;
  if (chartInstance.value) {
      chartInstance.value.setOption({
          series: [{
              force: {
                  friction: isPaused.value ? 1.0 : 0.6
              }
          }]
      });
  }
};

const toggleFullscreen = () => {
  const el = explorerWrapperRef.value;
  if (!el) return;

  if (!document.fullscreenElement) {
    el.requestFullscreen().catch(err => {
      console.error(`全屏失败: ${err.message}`);
    });
    isFullscreen.value = true;
  } else {
    document.exitFullscreen();
    isFullscreen.value = false;
  }
};

const onFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement;
};

const handleReset = () => {
  if (chartInstance.value) {
    chartInstance.value.dispatchAction({ type: 'restore' });
    isPaused.value = false;
    chartInstance.value.setOption({
          series: [{ force: { friction: 0.6 } }]
    });
  }
};

const handleSearch = () => {
  if (!searchQuery.value || !chartInstance.value) return;
  const targetNode = graphData.value.nodes.find((n: any) => 
    n.name.includes(searchQuery.value) || n.id.includes(searchQuery.value)
  );
  
  if (targetNode) {
    chartInstance.value.dispatchAction({
      type: 'highlight',
      seriesIndex: 0,
      name: targetNode.name
    });
    
    isPaused.value = true;
    alert(`已定位: ${targetNode.name}\n图表已暂停锁定。`);
  } else {
    alert('未找到匹配的节点');
  }
};

onMounted(() => {
  loadData();
  document.addEventListener('fullscreenchange', onFullscreenChange);
});

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange);
});
</script>

<template>
  <div class="explorer-wrapper" ref="explorerWrapperRef">
    <div class="toolbar">
      <div class="search-group">
        <el-input 
          v-model="searchQuery" 
          placeholder="搜索节点..." 
          :prefix-icon="Search"
          @keyup.enter="handleSearch"
          clearable
          class="search-input"
        />
        <el-button :icon="Aim" circle @click="handleSearch" title="定位" />
      </div>
      
      <div class="action-group">
        <el-button 
          :type="isPaused ? 'danger' : 'success'" 
          :icon="isPaused ? VideoPlay : VideoPause" 
          circle 
          @click="togglePause"
          :title="isPaused ? '点击继续' : '点击停止'"
        />
        
        <el-button 
          circle 
          :icon="FullScreen" 
          @click="toggleFullscreen" 
          :title="isFullscreen ? '退出全屏' : '全屏模式'"
          :type="isFullscreen ? 'primary' : 'default'"
        />
        
        <el-button :icon="Refresh" circle @click="handleReset" title="重置视图" />
      </div>
    </div>

    <div class="chart-area" v-loading="loading" element-loading-text="正在渲染全量数据...">
      <v-chart 
        ref="chartInstance"
        class="chart" 
        :option="chartOption" 
        autoresize 
      />
    </div>
    
    <div class="status-bar" v-if="isPaused">
      <span class="paused-tag">🛑 布局已锁定</span>
    </div>
  </div>
</template>

<style scoped>
.explorer-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  position: relative;
}

.explorer-wrapper:fullscreen {
  width: 100vw;
  height: 100vh;
  padding: 20px;
  box-sizing: border-box;
  background: #fff;
}

.toolbar {
  height: 50px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
  z-index: 10;
}

.search-group, .action-group { display: flex; gap: 8px; }
.search-input { width: 220px; }

.chart-area {
  flex: 1;
  width: 100%;
  min-height: 0;
  position: relative;
}

.chart { width: 100%; height: 100%; }

.status-bar {
  position: absolute;
  top: 60px;
  right: 20px;
  pointer-events: none;
}

.paused-tag {
  background: rgba(255, 0, 0, 0.1);
  color: #ff0000;
  border: 1px solid #ffcccc;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
</style>