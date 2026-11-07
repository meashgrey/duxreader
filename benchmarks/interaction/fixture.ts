// Large, deterministic local pages keep network variance out of measurements.
// The editor intentionally has many descendants: typing must not resample them.
export const interactionScenarios = [
  "input",
  "validation",
  "editor",
  "variables",
];
export function interactionPage(scenario: string) {
  const variableSheets =
    scenario === "variables"
      ? Array.from(
          { length: 30 },
          (_, i) =>
            `<style>:root{${Array.from({ length: 150 }, (_, j) => `--bench-size-${i}-${j}:${j}px;--bench-tone-${i}-${j}:#eee;`).join("")}}.probe-${i}{color:var(--bench-tone-${i}-1)}.probe-${i}:hover{background:var(--bench-tone-${i}-2)}</style>`,
        ).join("") +
        "<style>:root{--bench-base:#fff;--bench-hover:#eee;--bench-hover-alias:var(--bench-hover)}.card{background:var(--bench-base)}.card:hover{background:var(--bench-hover-alias)}</style>"
      : "";
  const cards = Array.from(
    { length: 400 },
    (_, i) =>
      `<article class="card"><h2>Thread ${i}</h2><p>Example discussion <a href="#">link</a></p><button>Reply</button></article>`,
  ).join("");
  const editor =
    scenario === "editor"
      ? `<div id="entry" contenteditable="true" role="textbox" aria-label="Editor">${Array.from({ length: 1200 }, () => "<span>Editable text </span>").join("")}</div>`
      : `<input id="entry" aria-label="Editor" ${scenario === "validation" ? 'required pattern="[a-z]{8,}"' : ""} placeholder="Write a reply">`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Interaction benchmark</title><style>
    body { background:white;color:#111;font:16px system-ui;margin:24px }
    .card { background:white;color:#222;padding:12px;border:1px solid #999 }
    .card:hover { background:#eee } a { color:blue }
    #composer { position:sticky;top:0;background:white;padding:16px;z-index:1 }
    #entry { background:white;color:#111;width:600px;max-height:160px;overflow:auto;border:1px solid #888;transition:background-color 80ms,color 80ms }
    #entry:focus { background:#eee } #entry:empty::before { content:"Write a reply" }
    ${scenario === "validation" ? "#entry:invalid {color:#b00020} #entry:valid {color:#111} #composer:has(#entry:placeholder-shown) #status {background:#eee} #composer:has(#entry:valid) #status {background:#ddd}" : ""}
    #composer:focus-within { background:#eee }
    </style>${variableSheets}</head><body><section id="composer"><button id="open">Open search</button><div id="search" hidden>${editor}<output id="status">Ready</output></div></section><main>${cards}</main>
    <script>
    // Event Timing has a 16 ms minimum threshold. Preserve censored observations
    // separately; do not call the p95 of reported slow events the page's INP.
    window.perfSample={events:[],longTasks:[],paints:[],trustedInputs:0};
    document.querySelector('#open').addEventListener('click',()=>{
      ${scenario === "variables" ? 'document.documentElement.style.setProperty("--bench-layout-open","1px");' : ""}
      document.querySelector('#search').hidden=false;
      document.querySelector('#entry').focus();
    });
    const presentation=()=>{
      const start=performance.now();
      requestAnimationFrame(()=>requestAnimationFrame(()=>window.perfSample.paints.push(performance.now()-start)));
    };
    document.querySelector('#entry').addEventListener('focusin',presentation);
    document.querySelector('main').addEventListener('pointerover',event=>{
      const card=event.target.closest('.card');
      if(card && !card.contains(event.relatedTarget)) presentation();
    });
    for (const type of ['event','longtask']) {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      new PerformanceObserver(list=>{
        for(const e of list.getEntries()) {
          if(type==='event' && e.interactionId) window.perfSample.events.push({name:e.name,duration:e.duration,inputDelay:e.processingStart-e.startTime,processing:e.processingEnd-e.processingStart,interactionId:e.interactionId});
          if(type==='longtask') window.perfSample.longTasks.push(e.duration);
        }
      }).observe({type,buffered:true,durationThreshold:16});
    }
    document.querySelector('#entry').addEventListener('input',event=>{
      if(!event.isTrusted) throw new Error('The benchmark requires trusted keyboard input');
      window.perfSample.trustedInputs++;
      ${scenario === "variables" ? 'event.target.style.setProperty("--bench-layout-width",window.perfSample.trustedInputs+"px");' : ""}
      presentation();
      // Mimic a controlled form's text-only status update.
      document.querySelector('#status').textContent='Characters: '+(event.target.value??event.target.textContent).length;
    });
    </script></body></html>`;
}
