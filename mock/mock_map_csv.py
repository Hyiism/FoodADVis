import csv
import random
import os

# --- 配置 ---
N_ROWS = 1500  # 生成多少条流通数据
OUTPUT_DIR = "public/mock_map"  # 输出目录 (Vue 项目通常放在 public 文件夹)

# 确保输出目录存在
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

print(f"--- 正在生成地图所需的 CSV 数据 ({N_ROWS} 条)... ---")

# --- 1. 基础字典数据 (必须匹配 GeoJSON 的标准名称) ---
# 重点覆盖沿海省份和主要消费省份，模拟水产品流通
LOCATIONS = {
    "浙江省": ["杭州市", "宁波市", "温州市", "舟山市", "台州市", "嘉兴市", "绍兴市", "金华市"],
    "江苏省": ["南京市", "苏州市", "无锡市", "南通市", "连云港市"],
    "山东省": ["济南市", "青岛市", "烟台市", "威海市", "日照市"],
    "福建省": ["福州市", "厦门市", "泉州市", "宁德市"],
    "广东省": ["广州市", "深圳市", "湛江市", "汕头市", "珠海市"],
    "上海市": ["上海市"], # 直辖市通常市名和省名处理逻辑需注意，这里简单处理
    "北京市": ["北京市"],
    "天津市": ["天津市"],
    "辽宁省": ["大连市", "沈阳市", "营口市"],
    "湖北省": ["武汉市", "荆州市"], # 淡水鱼产地
    "湖南省": ["长沙市", "岳阳市"],
    "四川省": ["成都市", "绵阳市"], # 内陆消费地
    "陕西省": ["西安市"]
}

PROVINCES = list(LOCATIONS.keys())

# 水产品类别
FOOD_CATEGORIES = [
    "大黄鱼", "小黄鱼", "带鱼", "南美白对虾", "中华绒螯蟹", 
    "扇贝", "牡蛎", "海参", "草鱼", "鲫鱼", "多宝鱼"
]

# 污染物/风险类别
ADULTERANTS = [
    "孔雀石绿", "硝基呋喃", "氯霉素", "重金属(镉)", 
    "重金属(汞)", "诺氟沙星", "恩诺沙星", "五氯酚酸钠", "无异常"
]

# --- 2. 生成主数据 graph_data.csv ---
# 列: production_location, production_location2, sale_location, sale_location2, adulterant_category, food_category, grade

data_rows = []

for _ in range(N_ROWS):
    # 随机选择产地
    prod_prov = random.choice(PROVINCES)
    prod_city = random.choice(LOCATIONS[prod_prov])
    
    # 随机选择销地 (稍微加一点逻辑：大概率是跨省运输，小概率省内)
    if random.random() < 0.7:
        sale_prov = random.choice(PROVINCES) # 跨省
    else:
        sale_prov = prod_prov # 省内
    sale_city = random.choice(LOCATIONS[sale_prov])
    
    # 随机选择商品和污染物
    food = random.choice(FOOD_CATEGORIES)
    
    # 风险逻辑：某些污染物导致更高的 Risk Grade
    # 假设 '无异常' 的 grade 较低，其他较高
    if random.random() < 0.6:
        adulterant = "无异常"
        grade = random.uniform(0.0, 0.3) # 低风险
    else:
        adulterant = random.choice([a for a in ADULTERANTS if a != "无异常"])
        grade = random.uniform(0.4, 1.0) # 中高风险

    row = {
        "production_location": prod_prov,
        "production_location2": prod_city,
        "sale_location": sale_prov,
        "sale_location2": sale_city,
        "adulterant_category": adulterant,
        "food_category": food,
        "grade": round(grade, 2)
    }
    data_rows.append(row)

# 写入 graph_data.csv
graph_csv_path = os.path.join(OUTPUT_DIR, 'graph_data.csv')
with open(graph_csv_path, 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=[
        "production_location", "production_location2", 
        "sale_location", "sale_location2", 
        "adulterant_category", "food_category", "grade"
    ])
    writer.writeheader()
    writer.writerows(data_rows)

print(f"✔ 已生成: {graph_csv_path}")

# --- 3. 生成下拉框数据 adulterant_category.csv ---
# 列: unique_adulterant_category
adulterant_csv_path = os.path.join(OUTPUT_DIR, 'adulterant_category.csv')
with open(adulterant_csv_path, 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(["unique_adulterant_category"]) # Header
    for a in ADULTERANTS:
        writer.writerow([a])

print(f"✔ 已生成: {adulterant_csv_path}")

# --- 4. 生成下拉框数据 food_categories.csv ---
# 列: unique_food_categories
food_csv_path = os.path.join(OUTPUT_DIR, 'food_categories.csv')
with open(food_csv_path, 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(["unique_food_categories"]) # Header
    for food in FOOD_CATEGORIES:
        writer.writerow([food])

print(f"✔ 已生成: {food_csv_path}")

print("\n--- Map Mock 数据生成完毕！ ---")
print(f"请确保这 3 个 CSV 文件位于你的 Vue 项目的 '{OUTPUT_DIR}' 文件夹根目录下。")
