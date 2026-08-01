const actionsElement = document.querySelector('#actions');
const messageElement = document.querySelector('#message');
let devices = [];

function setMessage(message, isError = false) {
  messageElement.textContent = message;
  messageElement.className = isError ? 'danger' : '';
}
function removeButton(row) { row.querySelector('.remove').addEventListener('click', () => row.remove()); }
function createDeviceSelect(selected = '') {
  const select = document.createElement('select'); select.className = 'device';
  const names = [...new Set([selected, ...devices].filter(Boolean))];
  if (!names.length) names.push('');
  for (const name of names) { const option = new Option(name || '機器を選択', name); option.selected = name === selected; select.add(option); }
  return select;
}
function addCommand(action = {}) {
  const row = document.querySelector('#command-template').content.firstElementChild.cloneNode(true);
  const original = row.querySelector('.device'); original.replaceWith(createDeviceSelect(action.deviceName));
  row.querySelector('.command-name').value = action.command || '';
  row.querySelector('.parameter').value = action.parameter === 'default' ? '' : (action.parameter || '');
  row.querySelector('.command-type').value = action.commandType || 'command'; row.querySelector('.when').value = action.when || 'always';
  row.querySelector('.enabled').checked = action.enabled !== false;
  removeButton(row); actionsElement.append(row);
}
function addWait(action = {}) {
  const row = document.querySelector('#wait-template').content.firstElementChild.cloneNode(true);
  row.querySelector('.duration').value = action.durationMs ?? 1000; row.querySelector('.enabled').checked = action.enabled !== false; removeButton(row); actionsElement.append(row);
}
function collectActions() {
  return [...actionsElement.children].map(row => {
    if (row.classList.contains('wait')) return { type: 'wait', durationMs: Number(row.querySelector('.duration').value), enabled: row.querySelector('.enabled').checked };
    return { type: 'command', deviceName: row.querySelector('.device').value, command: row.querySelector('.command-name').value,
      parameter: row.querySelector('.parameter').value || 'default', commandType: row.querySelector('.command-type').value, when: row.querySelector('.when').value, enabled: row.querySelector('.enabled').checked };
  });
}
async function load() {
  const [deviceResponse, automationResponse] = await Promise.all([fetch('/api/switchbot/devices'), fetch('/api/automations')]);
  if (deviceResponse.ok) devices = (await deviceResponse.json()).devices;
  if (!automationResponse.ok) throw new Error('設定を読み込めませんでした。');
  const automation = await automationResponse.json();
  automation.oneMemberArrivedHome.forEach(action => action.type === 'wait' ? addWait(action) : addCommand(action));
}
document.querySelector('#add-command').addEventListener('click', () => addCommand());
document.querySelector('#add-wait').addEventListener('click', () => addWait());
document.querySelector('#save').addEventListener('click', async () => {
  setMessage('保存中…');
  const response = await fetch('/api/automations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oneMemberArrivedHome: collectActions() }) });
  setMessage(response.ok ? '保存しました。次の帰宅時から反映されます。' : (await response.json()).error, !response.ok);
});
load().catch(error => setMessage(error.message, true));
