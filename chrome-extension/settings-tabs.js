// Switching tabs only hides panels; it never rebuilds forms or drops edits.
const settingsTabs = [...document.querySelectorAll('.settings-tabs [role="tab"]')];
function selectSettingsTab(tab, focus = false) {
  for (const item of settingsTabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  }
  if (focus) tab.focus();
}
for (const tab of settingsTabs) {
  tab.addEventListener('click', () => selectSettingsTab(tab));
  tab.addEventListener('keydown', event => {
    const index = settingsTabs.indexOf(tab);
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % settingsTabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + settingsTabs.length) % settingsTabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = settingsTabs.length - 1;
    else return;
    event.preventDefault();
    selectSettingsTab(settingsTabs[next], true);
  });
}
