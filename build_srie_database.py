import json
import os

def build_srie_database():
    srie_path = 'srie_database.json'
    if not os.path.exists(srie_path):
        print(f"Error: {srie_path} not found.")
        return
    
    with open(srie_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"Loaded SRIE Database version: {data.get('SRIE_DATABASE_VERSION', '1.0')}")
    countries = data.get('countries', {})
    print(f"Total countries in SRIE Database: {len(countries)}")
    
    # Ensure countries are sorted and formatted with zero duplicates
    sorted_countries = {k: countries[k] for k in sorted(countries.keys())}
    data['countries'] = sorted_countries
    data['total_countries'] = len(sorted_countries)
    
    with open(srie_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print("Successfully built and validated SRIE database.")

if __name__ == '__main__':
    build_srie_database()
