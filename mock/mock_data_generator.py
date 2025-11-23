import json
import random
import math
import csv
import os

# --- 配置 ---
N_SAMPLES = 3000  # 样本数量
N_PRODUCTS = 100
N_MARKETS = 50
N_FARMERS = 200
N_CONTAMINANTS = 50
OUTPUT_DIR = "public"

if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

print(f"--- [V12 复杂网络版] 生成 {N_SAMPLES} 条数据... ---")
print("--- 特性: 模拟真实世界的'一对多'复杂关联，增强图表视觉效果 ---")

# --- 1. 地理位置字典 ---
LOCATIONS = {
    "浙江省": ["杭州市", "宁波市", "温州市", "嘉兴市", "湖州市", "绍兴市", "金华市", "衢州市", "舟山市", "台州市", "丽水市"],
    "福建省": ["福州市", "厦门市", "宁德市", "泉州市"],
    "山东省": ["青岛市", "烟台市", "威海市", "日照市"],
    "江苏省": ["南京市", "苏州市", "南通市", "连云港市"],
    "广东省": ["广州市", "深圳市", "湛江市", "汕头市"],
    "辽宁省": ["大连市", "盘锦市"],
    "上海市": ["上海市"],
    "北京市": ["北京市"]
}
PROVINCES = list(LOCATIONS.keys())

HIGH_RISK_CITIES = ["舟山市", "台州市", "温州市", "宁波市", "青岛市", "湛江市"]
LOW_RISK_CITIES = ["金华市", "衢州市", "丽水市", "杭州市", "北京市"]

# ID 池
product_ids = [random.randint(5000, 5999) for _ in range(N_PRODUCTS)]
market_ids = [random.randint(6000, 6999) for _ in range(N_MARKETS)]
farmer_ids = [random.randint(7000, 7999) for _ in range(N_FARMERS)]
contaminant_ids = [random.randint(8000, 8999) for _ in range(N_CONTAMINANTS)]

FOOD_CATEGORIES = ["大黄鱼", "小黄鱼", "带鱼", "南美白对虾", "中华绒螯蟹", "扇贝", "牡蛎", "青蟹"]
ADULTERANTS = ["孔雀石绿", "硝基呋喃", "氯霉素", "重金属(镉)", "重金属(汞)", "诺氟沙星", "五氯酚酸钠", "无异常"]

# --- 2. 核心逻辑 ---

def get_weighted_province():
    if random.random() < 0.80:
        return "浙江省"
    else:
        return random.choice([p for p in PROVINCES if p != "浙江省"])

def get_city(province):
    return random.choice(LOCATIONS[province])

def get_risk_data(city_name):
    rand = random.random()
    # 简单风险逻辑
    if city_name in HIGH_RISK_CITIES:
        if rand < 0.6:
            return "高风险", random.uniform(0.75, 0.99), "不合格", random.choice([a for a in ADULTERANTS if a != "无异常"])
        elif rand < 0.85:
            return "中风险", random.uniform(0.50, 0.74), "合格", random.choice([a for a in ADULTERANTS if a != "无异常"])
    elif city_name in LOW_RISK_CITIES:
        if rand < 0.85:
            return "低风险", random.uniform(0.01, 0.35), "合格", "无异常"
            
    if rand < 0.7:
        return "低风险", random.uniform(0.01, 0.40), "合格", "无异常"
    else:
        return "中风险", random.uniform(0.41, 0.70), "合格", random.choice([a for a in ADULTERANTS if a != "无异常"])

def get_circular_coords(risk_level):
    center_x, center_y = 50, 50
    if risk_level == "低风险":
        r = math.sqrt(random.uniform(0.4, 1.0)) * 45
        theta = random.uniform(0, 2 * math.pi)
    else:
        r = math.sqrt(random.uniform(0.0, 0.3)) * 40
        theta = random.uniform(0, 2 * math.pi)
    return center_x + r * math.cos(theta), center_y + r * math.sin(theta)

# [修改] 生成更复杂的路径图
def generate_complex_paths(sample_id, ctx, risk):
    paths = []
    
    product = ctx["products"][0] # 假设一个样本主要对应一种产品ID
    
    # 1. 供应链路径：可能涉及多个农户汇聚，或者多个市场流转
    # 逻辑：Farmer(s) -> Product -> Market(s) -> Sample
    
    for farmer in ctx["farmers"]:
        # 每个农户都有一条到产品的路径
        paths.append([
            {"from": f"Farmer[{farmer}]", "to": f"Product[{product}]", "relation": "供应", "weight": 0.9},
            {"from": f"Product[{product}]", "to": f"InspectionRecord[{sample_id}]", "relation": "抽样", "weight": 1.0}
        ])
        
    for market in ctx["markets"]:
        # 产品在市场流通
        paths.append([
            {"from": f"Product[{product}]", "to": f"Market[{market}]", "relation": "流通", "weight": 0.8},
            {"from": f"Market[{market}]", "to": f"InspectionRecord[{sample_id}]", "relation": "抽检", "weight": 1.0}
        ])

    # 2. 风险路径：如果有风险，可能关联多个污染物
    if risk != "低风险":
        for contaminant in ctx["contaminants"]:
            # 污染物可能来自农户，也可能来自环境
            farmer_source = random.choice(ctx["farmers"])
            paths.append([
                {"from": f"Farmer[{farmer_source}]", "to": f"Contaminant[{contaminant}]", "relation": "违规使用", "weight": 0.95},
                {"from": f"Contaminant[{contaminant}]", "to": f"InspectionRecord[{sample_id}]", "relation": "检出", "weight": 0.99}
            ])
    
    return paths

# --- 3. 生成循环 ---
samples_list = []
context_dict = {}
explanations_dict = {}
csv_rows = []

for i in range(N_SAMPLES):
    sample_id = i + 1 
    
    prod_prov = get_weighted_province()
    prod_city = get_city(prod_prov)
    
    if prod_prov == "浙江省":
        sale_prov = "浙江省" if random.random() < 0.8 else random.choice(["上海市", "江苏省"])
        sale_city = get_city(sale_prov)
    else:
        sale_prov = "浙江省" if random.random() < 0.7 else "上海市"
        sale_city = get_city(sale_prov)

    if prod_city == sale_city and random.random() < 0.5:
        sale_prov = "浙江省"
        sale_city = "杭州市"

    risk, score, label, adulterant = get_risk_data(prod_city)
    food = random.choice(FOOD_CATEGORIES)
    x, y = get_circular_coords(risk)

    sample_obj = {
        "id": sample_id, "riskLevel": risk, "score": round(score, 4), "label": label, 
        "x": x, "y": y, "production_province": prod_prov, "production_city": prod_city,
        "sale_province": sale_prov, "sale_city": sale_city
    }
    samples_list.append(sample_obj)

    csv_rows.append({
        "production_location": prod_prov, "production_location2": prod_city,
        "sale_location": sale_prov, "sale_location2": sale_city,
        "adulterant_category": adulterant, "food_category": food, "grade": round(score, 2)
    })

    # [关键修改] 随机生成一对多的上下文
    # 高风险样本往往关联更多实体（更多嫌疑对象）
    n_farmers = random.randint(1, 2)
    n_markets = random.randint(1, 3) if risk == "低风险" else random.randint(2, 4)
    n_contaminants = 0 if risk == "低风险" else random.randint(1, 3)

    ctx = {
        "products": random.sample(product_ids, 1), # 产品通常是一个核心
        "farmers": random.sample(farmer_ids, n_farmers),
        "markets": random.sample(market_ids, n_markets),
        "contaminants": random.sample(contaminant_ids, n_contaminants) if n_contaminants > 0 else []
    }
    
    context_dict[str(sample_id)] = ctx
    explanations_dict[str(sample_id)] = generate_complex_paths(sample_id, ctx, risk)

# --- 4. 写入 ---
try:
    with open(os.path.join(OUTPUT_DIR, 'api_data_samples.json'), 'w', encoding='utf-8') as f:
        json.dump(samples_list, f, indent=2, ensure_ascii=False)
    with open(os.path.join(OUTPUT_DIR, 'api_data_context.json'), 'w', encoding='utf-8') as f:
        json.dump(context_dict, f, indent=2, ensure_ascii=False)
    with open(os.path.join(OUTPUT_DIR, 'api_data_explanations.json'), 'w', encoding='utf-8') as f:
        json.dump(explanations_dict, f, indent=2, ensure_ascii=False)

    headers = ["production_location", "production_location2", "sale_location", "sale_location2", "adulterant_category", "food_category", "grade"]
    with open(os.path.join(OUTPUT_DIR, 'graph_data.csv'), 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(csv_rows)
        
    with open(os.path.join(OUTPUT_DIR, 'adulterant_category.csv'), 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f); writer.writerow(["unique_adulterant_category"]); 
        for a in ADULTERANTS: writer.writerow([a])
            
    with open(os.path.join(OUTPUT_DIR, 'food_categories.csv'), 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f); writer.writerow(["unique_food_categories"]); 
        for f_cat in FOOD_CATEGORIES: writer.writerow([f_cat])

    print("✔ V12 复杂网络数据生成完毕！")
    print("  - 现在每个样本会关联多个 Farmer/Market/Contaminant")
    print("  - 力导向图将呈现更丰富的星系结构")

except Exception as e:
    print(f"❌ 写入错误: {e}")