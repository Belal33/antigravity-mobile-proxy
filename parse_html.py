import sys, json, re

try:
    with open('/tmp/out3.json') as f:
        data = json.load(f)
        html = data.get('afterHTML', '')
        
    print(f"HTML Length: {len(html)}")
    
    # Let's find "Artifacts Name"
    idx = html.find('Artifact Name')
    if idx != -1:
        print("\n=== Found 'Artifact Name' ===")
        # Print the DOM structure around it without dumping everything
        chunk = html[max(0, idx-500):idx+2500]
        # find the <div class="flex w-full flex-row items-center justify-between"> wrappers
        rows = re.findall(r'<div class="flex w-full flex-row items-center justify-between.*?</div>', chunk)
        print(f"Found {len(rows)} rows matching '.flex.w-full.flex-row.items-center.justify-between'")
        for i, r in enumerate(rows):
            print(f"Row {i}: {r}")
            
        print("\nRaw chunk:")
        print(chunk)
    else:
        print("No 'Artifact Name' found")
except Exception as e:
    print("Error:", e)
