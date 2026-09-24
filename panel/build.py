# Genera el panel completo: mete la vista "La voz de la Junta" dentro del
# prototipo del sistema de inteligencia territorial.
# Ponga el prototipo original como original.html en esta misma carpeta y ejecute:
#   python3 build.py
s = open('original.html', encoding='utf-8').read()
css = open('voz.css', encoding='utf-8').read()
html = open('voz.html', encoding='utf-8').read()
logos = open('logos.js', encoding='utf-8').read()
js = logos + open('voz.js', encoding='utf-8').read()
nav = ('<button class="nv" data-v="voz"><svg viewBox="0 0 24 24">'
       '<rect x="9" y="3" width="6" height="11" rx="3"/>'
       '<path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
       'La voz de la Junta<span class="vivo" aria-hidden="true"></span></button>\n  <span class="vista">')
s = s.replace('<span class="vista">', nav, 1)
i = s.rfind('</style></head>'); s = s[:i] + css + s[i:]
s = s.replace('</main>', html + '</main>', 1)
i = s.rfind('</script>'); s = s[:i] + js + s[i:]
open('Sistema_inteligencia_territorial_prototipo_v2.html', 'w', encoding='utf-8').write(s)
print('listo')
