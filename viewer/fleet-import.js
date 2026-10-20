// HangarXPLOR shiplist.json / shiplist.csv and simple { ships: [...] } lists.
// Format reference: github.com/dolkensp/HangarXPLOR/blob/release/src/web_resources/HangarXPLOR.Download.js
export function parseFleet(text, filename='fleet.json') {
  text=text.replace(/^\uFEFF/,'').trim();
  if(!text)throw new Error('The file is empty.');
  let rows;
  if(/\.(csv|tsv)$/i.test(filename)) {
    const separator=/\.tsv$/i.test(filename)?'\t':text.split(/\r?\n/)[0].includes(';')?';':',';
    const records=[];let row=[],field='',quoted=false;
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(c==='"'){if(quoted && text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
      else if(!quoted && (c===separator || c==='\n')){row.push(field.trim());field='';if(c==='\n'){records.push(row);row=[];}}
      else if(c!=='\r'||quoted)field+=c;
    }
    if(quoted)throw new Error('Invalid CSV: unclosed quotation marks.');
    row.push(field.trim());records.push(row);
    const headers=records.shift().map(h=>h.trim().toLowerCase().replace(/\s+/g,'_'));
    if(!headers.some(h=>['ship','name','ship_name','model'].includes(h)))throw new Error('Unsupported CSV: a Ship, Name, Ship_name or Model column is required.');
    rows=records.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
  } else {
    let data;try{data=JSON.parse(text);}catch{throw new Error('Invalid JSON. Use a JSON or CSV fleet export.');}
    rows=Array.isArray(data)?data:data?.ships;
    if(!Array.isArray(rows))throw new Error('Unsupported format: expected a JSON list or an object containing ships.');
  }
  if(rows.length>5000)throw new Error('Too many rows (maximum 5,000).');
  let ignored=0,total=0;
  const result=[];
  for(const row of rows) {
    if(row && row.entity_type && row.entity_type!=='ship'){ignored++;continue;}
    const obj=typeof row==='string'?{name:row}:row;
    if(!obj || typeof obj!=='object')throw new Error('Invalid fleet entry.');
    const names=[obj.model?.name, typeof obj.model==='string'?obj.model:null,obj.name,obj.ship,obj.ship_name].filter(n=>typeof n==='string' && n.trim()).map(n=>n.trim());
    if(!names.length){ignored++;continue;}
    const quantity=Number(obj.quantity??obj.count??1);
    if(!Number.isInteger(quantity)||quantity<1||quantity>200)throw new Error('Invalid quantity: expected an integer from 1 to 200.');
    total+=quantity;if(total>200)throw new Error('Import limited to 200 ships at a time. Reduce the selection in your export.');
    result.push({names,quantity,shipCode:typeof obj.ship_code==='string'?obj.ship_code:null,manufacturer:obj.manufacturer_name??obj.manufacturer?.name??obj.manufacturer??''});
  }
  if(!result.length)throw new Error('No ships found in this file.');
  return {rows:result,ignored,total};
}
const normalize=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function matchShip(row, makers) {
  const candidates=new Map();
  for(const maker of makers) for(const ship of maker.ships){
    const aliases=[...(ship.aliases??[]),ship.name,`${maker.name} ${ship.name}`,`${maker.code} ${ship.name}`,`${maker.name.split(' ')[0]} ${ship.name}`];
    for(const alias of aliases){const k=normalize(alias);if(!candidates.has(k))candidates.set(k,new Set());candidates.get(k).add(ship.id);}
  }
  // Export codes remain stable when the display name gains a suffix or a nickname.
  if(row.shipCode){const hits=candidates.get(normalize(row.shipCode));if(hits?.size===1)return [...hits][0];}
  // Prefer the actual model name; ship_name may be the owner's custom nickname.
  for(const name of row.names){const hits=candidates.get(normalize(name));if(hits?.size===1)return [...hits][0];}
  return null;
}
