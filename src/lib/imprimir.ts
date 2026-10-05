// Imprime un documento HTML sin abrir ventanas nuevas.
//
// Antes se abría una pestaña en blanco (about:blank), se escribía el HTML y se
// mandaba imprimir en su "onload". Chrome a veces ya había disparado ese
// evento (o bloquea la vista previa en pestañas about:blank) y el cuadro de
// impresión nunca aparecía. Aquí el documento se carga en un iframe oculto
// dentro de la misma página, se espera a que carguen las imágenes (logo y
// firma) y se manda imprimir. Desde ese cuadro se puede "Guardar como PDF".
export function imprimirHTML(html: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  // srcdoc hereda la dirección de la página: /colegio-mano-amiga.png sigue funcionando
  iframe.srcdoc = html;

  // El nombre sugerido al "Guardar como PDF" sale del título de la página
  const tituloOriginal = document.title;
  const titulo = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();

  let limpio = false;
  const limpiar = () => {
    if (limpio) return;
    limpio = true;
    document.title = tituloOriginal;
    setTimeout(() => iframe.remove(), 500);
  };

  iframe.onload = async () => {
    const w = iframe.contentWindow;
    const d = iframe.contentDocument;
    if (!w || !d) { limpiar(); return; }
    // Esperar imágenes (máx. 5 s para no quedarse colgado)
    const imagenes = Array.from(d.images).filter(img => !img.complete).map(img =>
      new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); }));
    // …y las tipografías (diplomas y reportes usan fuentes web)
    const fuentes = (d as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve();
    await Promise.race([Promise.all([...imagenes, fuentes]), new Promise(res => setTimeout(res, 5000))]);
    if (titulo) document.title = titulo;
    w.addEventListener('afterprint', limpiar);
    w.focus();
    w.print();
    // Si el navegador no avisa al cerrar el cuadro, se limpia después
    setTimeout(limpiar, 60_000);
  };

  document.body.appendChild(iframe);
}
