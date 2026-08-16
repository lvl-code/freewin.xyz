import sys
import re
import json

html = sys.stdin.read()

blocks = re.findall(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    html,
    re.I | re.S
)

print("JSON-LD blocks:", len(blocks))

if not blocks:
    print("❌ NO JSON-LD")
    sys.exit(1)

for i, block in enumerate(blocks, 1):
    try:
        data = json.loads(block.strip())

        print(f"✅ Block {i}: valid JSON")

        if isinstance(data, dict):
            print("   @context:", data.get("@context"))
            print("   @type:", data.get("@type"))

            if "@graph" in data:
                print("   @graph items:", len(data["@graph"]))

        elif isinstance(data, list):
            print("   Array items:", len(data))

    except Exception as e:
        print(f"❌ Block {i}: INVALID JSON")
        print("   Error:", e)
