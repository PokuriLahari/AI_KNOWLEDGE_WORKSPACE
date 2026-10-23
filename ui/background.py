"""
Floating Paths Background module for AI Knowledge Workspace.
Generates an animated, GPU-accelerated inline SVG ambient background
recreating the React FloatingPathsBackground component.
Optimized for Streamlit (Dark Theme) with clearly visible luminous flowing motion,
dual SMIL + CSS animation for 100% browser compatibility, zero lag,
and clean zero-indent markup to prevent Markdown code block leaking.
"""

from typing import List
import math
import textwrap


def _cubic_bezier_length(p0, p1, p2, p3, steps=40) -> float:
    """Calculate arc length of cubic bezier curve."""
    length = 0.0
    prev = p0
    for s in range(1, steps + 1):
        t = s / steps
        t1 = 1 - t
        x = (t1**3) * p0[0] + 3 * (t1**2) * t * p1[0] + 3 * t1 * (t**2) * p2[0] + (t**3) * p3[0]
        y = (t1**3) * p0[1] + 3 * (t1**2) * t * p1[1] + 3 * t1 * (t**2) * p2[1] + (t**3) * p3[1]
        length += math.hypot(x - prev[0], y - prev[1])
        prev = (x, y)
    return length


def generate_floating_paths_markup(count: int = 32, position: int = 1) -> str:
    """
    Generate deterministic SVG cubic bezier paths with varied widths,
    colors (luminous cyan, electric indigo, radiant violet, pale slate, blue-grey),
    opacities, and dual SMIL and CSS animation bindings for guaranteed, clearly visible motion.
    """
    # Luminous dark-theme palette featuring glowing cyan, electric blue, radiant violet,
    # as well as required slate tokens (#94a3b8, #64748b, #93c5fd)
    palette = [
        "#38bdf8",  # luminous cyan/sky (sky-400)
        "#64748b",  # blue-grey (slate-500)
        "#818cf8",  # electric indigo (indigo-400)
        "#94a3b8",  # pale slate (slate-400)
        "#93c5fd",  # soft ice blue (blue-300)
        "#a78bfa",  # radiant violet (violet-400)
        "#06b6d4",  # electric cyan (cyan-500)
        "#60a5fa",  # bright azure (blue-400)
        "#c084fc",  # soft neon purple (purple-400)
    ]

    path_items: List[str] = []

    for i in range(count):
        # Coordinates matching the original Motion SVG formula
        p0 = (-(380 - i * 5 * position), -(189 + i * 6))
        p1 = (-(380 - i * 5 * position), -(189 + i * 6))
        p2 = (-(312 - i * 5 * position), 216 - i * 6)
        p3 = (152 - i * 5 * position, 343 - i * 6)
        l1 = _cubic_bezier_length(p0, p1, p2, p3)

        p4 = p3
        p5 = (616 - i * 5 * position, 470 - i * 6)
        p6 = (684 - i * 5 * position, 875 - i * 6)
        p7 = (684 - i * 5 * position, 875 - i * 6)
        l2 = _cubic_bezier_length(p4, p5, p6, p7)

        total_len = int(l1 + l2)
        dash = int(total_len * 0.44)
        gap = int(total_len * 0.56)
        cycle_len = dash + gap

        d = f"M{p0[0]} {p0[1]}C{p1[0]} {p1[1]} {p2[0]} {p2[1]} {p3[0]} {p3[1]}C{p5[0]} {p5[1]} {p6[0]} {p6[1]} {p7[0]} {p7[1]}"

        # Deterministic styling attributes
        color = palette[i % len(palette)]
        width = 1.0 + (i % 6) * 0.25  # 1.00px to 2.25px (clearly visible strokes)
        base_opacity = 0.26 + (i % 8) * 0.04  # 0.26 to 0.54 for luminous presence against dark background
        peak_opacity = min(0.92, base_opacity * 1.8)

        # Deterministic animation timing: 12s - 22s for smooth continuous drift
        duration = 12.0 + ((i * 7) % 11) * 1.0  # 12.0s to 22.0s
        delay = ((i * 11) % 17) * 1.1  # mid-cycle offset

        # Dual animation: Native SMIL <animate> for direct GPU SVG compositor execution,
        # paired with standard CSS presentation attributes
        path_markup = (
            f'<path class="floating-path" d="{d}" stroke="{color}" stroke-width="{width:.2f}" '
            f'stroke-opacity="{base_opacity:.2f}" stroke-dasharray="{dash} {gap}" stroke-dashoffset="0" '
            f'style="animation-duration: {duration:.1f}s; animation-delay: -{delay:.1f}s;">'
            f'<animate attributeName="stroke-dashoffset" from="0" to="-{cycle_len}" dur="{duration:.1f}s" begin="-{delay:.1f}s" repeatCount="indefinite" />'
            f'<animate attributeName="stroke-opacity" values="{base_opacity:.2f}; {peak_opacity:.2f}; {base_opacity:.2f}" dur="{duration:.1f}s" begin="-{delay:.1f}s" repeatCount="indefinite" />'
            f'</path>'
        )
        path_items.append(path_markup)

    return "".join(path_items)


def get_floating_paths_svg(position: int = 1) -> str:
    """
    Renders the complete HTML & CSS snippet for the Dark-Themed FloatingPathsBackground.
    - Pure inline SVG (responsive viewBox 0 0 696 316).
    - Obsidian dark theme background canvas with glowing aurora ambient curves.
    - Non-interactive (pointer-events: none, z-index: 0).
    - Guaranteed visible movement via native SVG SMIL and CSS keyframe animations.
    - Dark glassmorphic chat bubbles, sidebar, and cards with high contrast readability.
    - Uses dedented formatting to prevent Markdown parser from treating styles as code blocks.
    """
    paths_markup = generate_floating_paths_markup(count=32, position=position)

    raw_html = f"""<div class="floating-paths-container" aria-hidden="true"><svg class="floating-paths-svg" viewBox="0 0 696 316" fill="none" preserveAspectRatio="xMidYMid slice">{paths_markup}</svg></div>
<style>
/* Root Dark Theme Canvas */
[data-testid="stAppViewContainer"] {{
  background: radial-gradient(ellipse at 50% 0%, #0d1527 0%, #080c14 60%, #030712 100%) !important;
  color: #f1f5f9 !important;
}}

[data-testid="stHeader"] {{
  background: transparent !important;
}}

/* Floating Paths Decorative Layer */
.floating-paths-container {{
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}}

.floating-paths-svg {{
  width: 100%;
  height: 100%;
  display: block;
  overflow: hidden;
}}

/* Continuous Motion Animation */
.floating-path {{
  fill: none;
  stroke-linecap: round;
  animation-name: floatingPathMotion;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: stroke-dashoffset, stroke-opacity, opacity;
}}

@keyframes floatingPathMotion {{
  0% {{
    stroke-dashoffset: 0;
    opacity: 0.40;
  }}
  50% {{
    opacity: 0.88;
  }}
  100% {{
    stroke-dashoffset: -1600;
    opacity: 0.40;
  }}
}}

/* Accessibility: Respect prefers-reduced-motion */
@media (prefers-reduced-motion: reduce) {{
  .floating-path {{
    animation: none !important;
    stroke-dasharray: none !important;
  }}
}}

/* Dark UI Glassmorphism & Readability */
[data-testid="stChatMessage"] {{
  background-color: rgba(15, 23, 42, 0.78) !important;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(56, 189, 248, 0.20) !important;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  margin-bottom: 10px;
  color: #f1f5f9 !important;
}}

[data-testid="stChatInput"] {{
  background-color: rgba(15, 23, 42, 0.90) !important;
  border: 1px solid rgba(56, 189, 248, 0.35) !important;
  border-radius: 14px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.55);
}}

[data-testid="stChatInput"] textarea {{
  color: #f8fafc !important;
}}

[data-testid="stSidebar"] {{
  background-color: rgba(11, 15, 25, 0.92) !important;
  border-right: 1px solid rgba(51, 65, 85, 0.65) !important;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}}

[data-testid="stExpander"] {{
  background-color: rgba(15, 23, 42, 0.70) !important;
  border: 1px solid rgba(51, 65, 85, 0.60) !important;
  border-radius: 10px;
  color: #e2e8f0 !important;
}}

.stTabs [data-baseweb="tab-list"] {{
  gap: 8px;
  background-color: rgba(15, 23, 42, 0.65);
  padding: 4px;
  border-radius: 10px;
  border: 1px solid rgba(51, 65, 85, 0.50);
}}

.stTabs [data-baseweb="tab"] {{
  color: #94a3b8 !important;
  border-radius: 8px;
}}

.stTabs [aria-selected="true"] {{
  background-color: rgba(56, 189, 248, 0.18) !important;
  color: #38bdf8 !important;
}}
</style>"""
    return textwrap.dedent(raw_html).strip()
