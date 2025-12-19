import requests
import curl_cffi
url = 'https://www.youtube.com/watch?v=kD0EZHwb9Zo'

resp = curl_cffi.get(url, impersonate='chrome116')
print(resp.status_code)
html = resp.text

with open('t.html', 'w', encoding='utf-8') as f:
    f.write(html)

ytInitialPlayerResponse = re.search(r'ytInitialPlayerResponse = (.*?);', html).group(1)
print(ytInitialPlayerResponse)