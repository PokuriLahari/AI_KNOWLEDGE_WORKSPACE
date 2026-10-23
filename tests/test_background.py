import unittest
import sys
from pathlib import Path

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ui.background import get_floating_paths_svg, generate_floating_paths_markup


class TestFloatingPathsBackground(unittest.TestCase):
    def test_svg_structure_and_accessibility(self):
        html = get_floating_paths_svg(position=1)
        # Verify SVG presence and responsive sizing
        self.assertIn("<svg", html)
        self.assertIn('viewBox="0 0 696 316"', html)
        self.assertIn('preserveAspectRatio="xMidYMid slice"', html)

        # Accessibility and non-interactive overlay
        self.assertIn('aria-hidden="true"', html)
        self.assertIn("pointer-events: none;", html)
        self.assertIn("position: fixed;", html)

    def test_reduced_motion_media_query_present(self):
        html = get_floating_paths_svg(position=1)
        self.assertIn("@media (prefers-reduced-motion: reduce)", html)
        self.assertIn("animation: none !important;", html)

    def test_deterministic_generation(self):
        """Verify that rerun generation produces 100% identical output (no random calls)."""
        html_run_1 = get_floating_paths_svg(position=1)
        html_run_2 = get_floating_paths_svg(position=1)
        self.assertEqual(html_run_1, html_run_2)

    def test_light_theme_palette_and_paths_count(self):
        html = get_floating_paths_svg(position=1)
        # Check path elements count
        self.assertEqual(html.count('<path class="floating-path"'), 32)
        # Check pale slate / blue-grey / subtle blue palette presence
        self.assertIn("#94a3b8", html)  # slate
        self.assertIn("#64748b", html)  # blue-grey
        self.assertIn("#93c5fd", html)  # subtle blue

    def test_content_readability_styling_present(self):
        html = get_floating_paths_svg(position=1)
        # Verify chat message and sidebar readability styles
        self.assertIn('[data-testid="stChatMessage"]', html)
        self.assertIn('[data-testid="stSidebar"]', html)
        self.assertIn("backdrop-filter: blur", html)

    def test_continuous_motion_bindings(self):
        html = get_floating_paths_svg(position=1)
        # Verify native SVG SMIL animations for reliable continuous movement
        self.assertIn('<animate attributeName="stroke-dashoffset"', html)
        self.assertIn('<animate attributeName="stroke-opacity"', html)
        # Verify CSS keyframes binding
        self.assertIn('@keyframes floatingPathMotion', html)
        self.assertIn('stroke-dashoffset', html)



if __name__ == "__main__":
    unittest.main()
