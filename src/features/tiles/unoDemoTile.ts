import {type InMemoryMasl} from '@dasl/tile-lexicon'

/**
 * A deliberately small, offline Tile. It proves the host can execute a
 * content-addressed-style bundle without granting it Blacksky credentials,
 * network access, or a React Native bridge.
 */
export const UNO_DEMO_TILE_ID = 'blacksky-demo-uno'

export const unoDemoTile: InMemoryMasl = {
  name: 'Uno — offline demo',
  short_name: 'Uno demo',
  description: 'A local-only Web Tile used to exercise Blacksky’s Tiles host.',
  categories: ['games', 'prototype'],
  theme_color: '#f54b35',
  background_color: '#fff7ed',
  sizing: {width: 640, height: 560},
  resources: {
    '/': {
      'content-type': 'text/html',
      src: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Uno demo</title><style>
*{box-sizing:border-box}body{margin:0;background:#fff7ed;color:#241b18;font:16px system-ui,sans-serif}.app{min-height:100vh;padding:24px;display:grid;gap:20px;align-content:start}header{display:flex;justify-content:space-between;align-items:center}h1{margin:0;font-size:24px}.badge{background:#f54b35;color:white;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:700}.pile{width:104px;height:148px;border:8px solid #241b18;border-radius:12px;background:#f54b35;color:white;display:grid;place-items:center;font-size:42px;font-weight:800;transform:rotate(-5deg)}.cards{display:flex;flex-wrap:wrap;gap:10px}.card{width:76px;height:112px;border:0;border-radius:10px;color:white;font-size:32px;font-weight:800;box-shadow:0 2px 0 #241b18;cursor:pointer}.red{background:#e64737}.yellow{background:#e9a825}.green{background:#2d9c68}.blue{background:#3376c9}button:focus-visible{outline:4px solid #241b18;outline-offset:3px}.status{font-weight:700}.note{color:#62534c;font-size:13px}</style></head>
<body><main class="app"><header><div><h1>Uno</h1><div class="note">Offline Tile · no account or network access</div></div><span class="badge">DEMO</span></header><section><div class="pile" id="pile">7</div></section><div class="status" id="status">Play a card matching 7.</div><section class="cards" id="cards"></section><p class="note">This is intentionally single-player and local. Multiplayer must use an explicit, host-mediated game capability.</p></main><script>
const cards=[['red','7'],['yellow','2'],['green','7'],['blue','9'],['red','+2']];let top='7';const pile=document.querySelector('#pile'),status=document.querySelector('#status'),hand=document.querySelector('#cards');
function render(){hand.replaceChildren(...cards.map(([color,value],index)=>{const b=document.createElement('button');b.className='card '+color;b.textContent=value;b.onclick=()=>play(index);return b}))}function play(index){const [color,value]=cards[index];if(value!==top&&value!=='+2'){status.textContent='That card does not match '+top+'. Try another.';return}top=value;pile.textContent=value;cards.splice(index,1);status.textContent=cards.length?'Nice — play another matching '+top+'.':'Uno! You played every card.';render()}render();
</script></body></html>`,
    },
  },
}
