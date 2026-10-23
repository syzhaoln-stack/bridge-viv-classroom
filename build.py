from pathlib import Path
import re
root=Path(__file__).resolve().parent
src=root/'src'
text=(src/'index.html').read_text(encoding='utf-8')
panel=(src/'browser-panel.html').read_text(encoding='utf-8')
lesson=(src/'browser-lesson-panel.html').read_text(encoding='utf-8')
panel=panel.replace('<footer class="browser-footer">',lesson+'\n<footer class="browser-footer">')
text=re.sub(r'<main id="browser-lab"[\s\S]*?</main>',lambda m:panel,text,count=1)
text=re.sub(r'<link rel="stylesheet" href="([^"]+)">',lambda m:'<style>'+ (src/m[1]).read_text(encoding='utf-8')+'</style>',text)
text=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+ (src/m[1]).read_text(encoding='utf-8')+'</script>',text)
text=re.sub(r'<script type="application/x-viv-worker" id="([^"]+)" data-worker-src="([^"]+)"></script>',lambda m:'<script type="application/x-viv-worker" id="'+m[1]+'">'+(src/m[2]).read_text(encoding='utf-8')+'</script>',text)
text=text.replace('href="advanced.html"','href="涡振_尾涡与原始记录_进阶分析.html"')
(root/'index.html').write_text(text,encoding='utf-8')
print('Built index.html:',len(text.encode('utf-8')),'bytes')
