import pathlib

path = pathlib.Path(r'C:\Users\DELL\Documents\GitHub\‏‏OfirBaram\.git\meital-booking-system\backend\gas-backend.js')
text = path.read_text(encoding='utf-8')

OLD = '''function prop(key) {
  if (key === undefined || key === null) {
    var _err = new Error('[prop] called with ' + typeof key + ' key');
    Logger.log('=== prop() BAD KEY ===');
    Logger.log('key value : ' + String(key));
    Logger.log('key typeof: ' + typeof key);
    var frames = (_err.stack || 'no stack').split('\n');
    for (var i = 0; i < frames.length; i++) {
      Logger.log('  STACK[' + i + ']: ' + frames[i].trim());
    }
    Logger.log('=== end BAD KEY ===');
    console.error('[prop] BAD KEY — value=' + String(key) + ' typeof=' + typeof key, _err);
    return null;
  }
  Logger.log('[DEBUG] prop("' + key + '") called');
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) {
    Logger.log('[WARN] prop("' + key + '") — script property is not set; returning null');
    return null;
  }
  Logger.log('[DEBUG] prop("' + key + '") — found, length=' + val.length);
  return val;
}'''

NEW = '''function prop(key) {
  // ── HONEY POT diagnostic — remove after root cause is identified ──
  var _trace = new Error('prop-honeypot');
  Logger.log('[HP] prop() entered | key=' + String(key) + ' | typeof=' + typeof key);
  try {
    var _gKeys = Object.keys(globalThis).filter(function(k) { return k.indexOf('_') !== 0; });
    Logger.log('[HP] global scope keys: ' + _gKeys.join(', '));
  } catch (_e) { Logger.log('[HP] globalThis unavailable: ' + _e); }
  var _frames = (_trace.stack || 'no stack').split('\n');
  for (var _i = 0; _i < _frames.length; _i++) {
    Logger.log('[HP] frame[' + _i + ']: ' + _frames[_i].trim());
  }
  console.error('[prop-honeypot] key=' + String(key) + ' typeof=' + typeof key, _trace);
  debugger;
  // ── end HONEY POT ──

  if (key === undefined || key === null) {
    Logger.log('=== prop() BAD KEY ===');
    Logger.log('key value : ' + String(key));
    Logger.log('key typeof: ' + typeof key);
    Logger.log('=== end BAD KEY ===');
    return null;
  }
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) {
    Logger.log('[WARN] prop("' + key + '") — not set in Script Properties');
    return null;
  }
  return val;
}'''

if OLD in text:
    text = text.replace(OLD, NEW, 1)
    path.write_text(text, encoding='utf-8')
    print('PATCHED')
else:
    print('OLD string not found — no change made')
