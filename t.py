import json
from collections import Counter

with open('.temp/t2.json', 'r', encoding='utf-8') as f:
    d = json.load(f)
    data = d['streamingData']['adaptiveFormats']
st = set()
counter = Counter()
for item in data:
    if 'audioTrack' in item:
        # st.add(tuple(item['audioTrack'].values()))
        counter[tuple(item['audioTrack'].values())] += 1
for item in sorted(counter.items(), key=lambda x: x[1], reverse=True):
    print(item)

print(len(counter))