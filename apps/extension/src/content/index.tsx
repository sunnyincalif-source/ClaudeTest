// Content script on leetcode.com: mounts the LeetTrace side panel (in a shadow root, so
// styles are isolated both ways) and the Trace button, and keeps both attached across
// LeetCode's in-app navigation. Inactive on pages other than /problems/*.
import { createRoot } from 'react-dom/client';
import componentsCss from '@leettrace/design/components.css?inline';
import vizCss from '@leettrace/viz/viz.css?inline';
import panelCss from './panel.css?inline';
import { startLeetTrace } from './attach';
import { injectFonts } from './fonts';
import { Panel } from './Panel';

startLeetTrace({
  mountPanel(host) {
    injectFonts();
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `${vizCss}\n${componentsCss}\n${panelCss}`;
    shadow.appendChild(style);
    const container = document.createElement('div');
    container.className = 'ltx-root ds-auto';
    shadow.appendChild(container);
    createRoot(container).render(<Panel />);
  },
});
