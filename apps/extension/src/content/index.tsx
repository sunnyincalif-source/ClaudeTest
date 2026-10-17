// Content script on leetcode.com: mounts the LeetTrace side panel (in a shadow root, so
// styles are isolated both ways) and the Trace button, and keeps both attached across
// LeetCode's in-app navigation. Inactive on pages other than /problems/*.
import { createRoot } from 'react-dom/client';
import vizCss from '@leettrace/viz/viz.css?inline';
import panelCss from './panel.css?inline';
import { startLeetTrace } from './attach';
import { Panel } from './Panel';

startLeetTrace({
  mountPanel(host) {
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `${vizCss}\n${panelCss}`;
    shadow.appendChild(style);
    const container = document.createElement('div');
    container.className = 'ltx-root';
    shadow.appendChild(container);
    createRoot(container).render(<Panel />);
  },
});
