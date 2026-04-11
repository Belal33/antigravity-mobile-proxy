import re
with open('/tmp/ide_dom.html') as f:
    html = f.read()

# First, find "Artifacts ("
idx = html.find('Artifacts (')
if idx != -1:
    print("Found 'Artifacts (' at", idx)
    print("Around:", html[max(0, idx-100):idx+500])
else:
    print("No 'Artifacts (' found in /tmp/ide_dom.html")
