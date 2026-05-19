"""
Add window.onerror graceful degradation block to admin.html.
Inserted as the FIRST script in <head>, before any other scripts,
so it catches syntax / load errors in the files that follow.

Usage: python fix_admin_onerror.py <abs_path_to_admin.html>
"""
import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# Guard: don't double-insert
if 'window.onerror' in src:
    print('SKIP: window.onerror already present in admin.html')
    sys.exit(0)

OLD = """  <script>
    tailwind = {"""

NEW = """  <!-- Graceful degradation: catch any JS load/parse error before a white screen -->
  <script>
    window.onerror = function(msg, src, line, col, err) {
      var box = document.getElementById('js-crash-banner');
      if (!box) {
        box = document.createElement('div');
        box.id = 'js-crash-banner';
        box.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;' +
          'align-items:center;justify-content:center;background:#FAF5F0;' +
          'font-family:Heebo,sans-serif;direction:rtl;padding:2rem;z-index:9999;';
        document.body ? document.body.appendChild(box) : document.addEventListener('DOMContentLoaded', function(){ document.body.appendChild(box); });
      }
      box.innerHTML =
        '<div style="max-width:420px;text-align:center;">' +
          '<div style="font-size:2.5rem;margin-bottom:1rem;">⚠️</div>' +
          '<h2 style="color:#A67C8E;font-weight:900;margin-bottom:.5rem;">שגיאה בטעינת הדשבורד</h2>' +
          '<p style="color:#4A2E3A;font-size:.9rem;margin-bottom:.5rem;">' + msg + '</p>' +
          '<p style="color:#999;font-size:.75rem;direction:ltr;">' + src + ':' + line + ':' + col + '</p>' +
          '<button onclick="location.reload()" ' +
            'style="margin-top:1.5rem;background:#A67C8E;color:#fff;border:none;' +
            'padding:.75rem 2rem;border-radius:1rem;font-size:1rem;cursor:pointer;">רענן דף</button>' +
        '</div>';
      console.error('[ADMIN CRASH]', { msg: msg, src: src, line: line, col: col, err: err });
      return true;
    };
  </script>

  <script>
    tailwind = {"""

count = src.count(OLD)
if count != 1:
    print('ERROR: anchor found ' + str(count) + ' times', file=sys.stderr)
    sys.exit(1)

result = src.replace(OLD, NEW, 1)
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(result)
print('OK: window.onerror graceful degradation added to admin.html')
