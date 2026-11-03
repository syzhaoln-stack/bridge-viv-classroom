"""Embed the editable time-difference lesson in the existing standalone CFD page.

Run: python build_cfd.py. No packages or network required. The original spatial
and finite-volume lessons remain in the HTML; src/cfd-time-* is the new source.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
PAGE = ROOT / 'CFD_三维控制体与有限体积.html'
text = PAGE.read_text(encoding='utf-8')

def embed(name, content, before):
    global text
    start, end = f'<!-- {name}:start -->', f'<!-- {name}:end -->'
    block = f'{start}\n{content}\n{end}\n'
    pattern = re.escape(start) + r'[\s\S]*?' + re.escape(end) + r'\n?'
    if start in text:
        text, count = re.subn(pattern, lambda _: block, text, count=1)
        assert count == 1
    else:
        assert text.count(before) == 1, before
        text = text.replace(before, block + before, 1)

heading = '<section class="lesson-head"><p class="eyebrow">CFD · 从时间采样理解离散化</p><h1>导数，就是相邻记录的变化率</h1><p>先用位移、速度和加速度理解原函数、一阶导数、二阶导数。拖动时间步 Δt，看连续曲线怎样变成计算机里的数值；空间导数与有限体积实验可在下方展开。</p></section>'
text, count = re.subn(r'<section class="lesson-head">[\s\S]*?</section>', lambda _: heading, text, count=1)
assert count == 1
if 'id="spatial-extension"' not in text:
    start = '<section id="derivatives"'
    end = '<details id="fvm-extension"'
    assert text.count(start) == text.count(end) == 1
    text = text.replace(start, '<details id="spatial-extension" class="spatial-extension"><summary>进阶：展开空间导数与空间—时间曲面（保留原实验）</summary>\n' + start, 1)
    text = text.replace(end, '</details>\n' + end, 1)
embed('cfd-time-style', '<style>\n' + (ROOT / 'src/cfd-time.css').read_text(encoding='utf-8') + '\n</style>', '</head>')
embed('cfd-time-panel', (ROOT / 'src/cfd-time-panel.html').read_text(encoding='utf-8'), '<details id="spatial-extension"')
embed('cfd-time-script', '<script>\n' + (ROOT / 'src/cfd-time.js').read_text(encoding='utf-8') + '\n</script>', '</body>')
PAGE.write_text(text, encoding='utf-8', newline='\n')
print(f'Built {PAGE.name}: {len(text.encode("utf-8"))} bytes')
