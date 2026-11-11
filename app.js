import { detectColorTomatoes } from './detector.js';

const $ = (id) => document.getElementById(id);
const video = $('video'), stage = $('stage'), overlay = $('overlay');
const ctx = overlay.getContext('2d');
let db;
let stream = null, rearCamera = true;
let liveBoxes = [], manualBoxes = [], autoMode = true;
let holdTimer = null, holding = false, snapping = false;
let renderTimer = null, lastCameraError = '';
let totalCount = 0, lastDownloadUrl = null;
let attrList = [];
let photoUnderReview = null, selectedBox = -1, reviewImageUrl = null;
let dragging = null, originalReviewBoxes = null;
let toastTimer = null;
let galleryUrls = [];
let exportInProgress = false;
let autoExportQueued = false;
const GALLERY_PAGE_SIZE = 24;
let galleryLimit = GALLERY_PAGE_SIZE;
let selectionMode = false;
const selectedPhotoIds = new Set();

function tell(message){
  const t=$('toast');t.textContent=message;t.hidden=false;
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,3300);
}
function invalidateZip(){
  if(lastDownloadUrl){URL.revokeObjectURL(lastDownloadUrl);lastDownloadUrl=null;}
  $('downloadArea').hidden=true;
}
function getCfg(key, fallback){try {return localStorage.getItem('tomato:'+key) ?? fallback;}catch{return fallback;}}
function putCfg(key, value){try {localStorage.setItem('tomato:'+key,String(value));}catch{}}
function uid(){return (globalThis.crypto?.randomUUID?.() || 'box-'+Date.now()+'-'+Math.floor(Math.random()*100000));}

function openDatabase(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('tomato-capture-v1',2);
    req.onupgradeneeded=(event)=>{
      const database=req.result;
      let store;
      if(event.oldVersion<1){
        store=database.createObjectStore('photos',{keyPath:'id',autoIncrement:true});
        store.createIndex('createdAt','createdAt');
      }else{
        store=req.transaction.objectStore('photos');
      }
      if(!store.indexNames.contains('backupStatus'))store.createIndex('backupStatus','backupStatus');
      if(!store.indexNames.contains('exportedAt'))store.createIndex('exportedAt','exportedAt');
      if(event.oldVersion<2){
        store.openCursor().onsuccess=(e)=>{
          const cursor=e.target.result;
          if(!cursor)return;
          const value=cursor.value;
          if(!value.backupStatus)value.backupStatus='pending';
          if(!('exportedAt' in value))value.exportedAt='';
          cursor.update(value);
          cursor.continue();
        };
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
function savePhoto(record){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('photos','readwrite');const req=tx.objectStore('photos').put(record);
    req.onsuccess=()=>record.id=req.result;
    tx.oncomplete=()=>resolve(record);
    tx.onerror=()=>reject(tx.error||new Error('Không thể lưu ảnh'));
    tx.onabort=()=>reject(tx.error||new Error('Lưu ảnh bị hủy'));
  });
}
function getPhoto(id){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('photos');const req=tx.objectStore('photos').get(Number(id));
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
function countPhotos(){
  return new Promise((resolve,reject)=>{
    const req=db.transaction('photos').objectStore('photos').count();
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
function countByBackupStatus(status){
  return new Promise((resolve,reject)=>{
    const req=db.transaction('photos').objectStore('photos').index('backupStatus').count(status);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
function pendingPhotos(limit=100){
  return new Promise((resolve,reject)=>{
    const items=[];
    const req=db.transaction('photos').objectStore('photos').index('backupStatus').openCursor('pending');
    req.onsuccess=()=>{
      const cursor=req.result;
      if(!cursor||items.length>=limit){resolve(items);return;}
      items.push(cursor.value);
      cursor.continue();
    };
    req.onerror=()=>reject(req.error);
  });
}
function markPhotosBackedUp(ids,batchName){
  if(!ids.length)return Promise.resolve();
  const stamp=new Date().toISOString();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('photos','readwrite');
    const store=tx.objectStore('photos');
    for(const id of ids){
      const req=store.get(Number(id));
      req.onsuccess=()=>{
        const rec=req.result;
        if(!rec)return;
        rec.backupStatus='exported';
        rec.exportedAt=stamp;
        rec.exportedBatch=batchName;
        store.put(rec);
      };
    }
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('Không thể cập nhật trạng thái sao lưu'));
    tx.onabort=()=>reject(tx.error||new Error('Cập nhật trạng thái sao lưu bị hủy'));
  });
}
function recentPhotos(limit=8){
  return new Promise((resolve,reject)=>{
    const items=[],req=db.transaction('photos').objectStore('photos').openCursor(null,'prev');
    req.onsuccess=()=>{const cursor=req.result;if(!cursor||items.length>=limit){resolve(items);return;}items.push(cursor.value);cursor.continue();};
    req.onerror=()=>reject(req.error);
  });
}
function loadBatch(offset,limit){
  return new Promise((resolve,reject)=>{
    const items=[],req=db.transaction('photos').objectStore('photos').openCursor();
    let skipped=false;
    req.onsuccess=()=>{
      const cursor=req.result;if(!cursor||items.length>=limit){resolve(items);return;}
      if(!skipped&&offset){skipped=true;cursor.advance(offset);return;}
      skipped=true;items.push(cursor.value);cursor.continue();
    };req.onerror=()=>reject(req.error);
  });
}
function allPhotoIds(){
  return new Promise((resolve,reject)=>{
    const req=db.transaction('photos').objectStore('photos').getAllKeys();
    req.onsuccess=()=>resolve(req.result.map(Number));
    req.onerror=()=>reject(req.error);
  });
}
function deletePhotos(ids){
  if(!ids.length)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('photos','readwrite');
    const store=tx.objectStore('photos');
    for(const id of ids)store.delete(Number(id));
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('Không thể xóa ảnh'));
    tx.onabort=()=>reject(tx.error||new Error('Xóa ảnh bị hủy'));
  });
}
function deletePhoto(id){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('photos','readwrite');tx.objectStore('photos').delete(Number(id));
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
}
function clearPhotos(){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('photos','readwrite');tx.objectStore('photos').clear();
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });
}

function readSettings(){
  for(const id of ['ripeness','disease','interval','quality']){
    $(id).value=getCfg(id,$(id).value);
    $(id).addEventListener('change',()=>putCfg(id,$(id).value));
  }
  try{attrList=JSON.parse(getCfg('attrs','[]'));if(!Array.isArray(attrList))attrList=[];}catch{attrList=[];}
  attrList=attrList.slice(0,8).filter(x=>x&&typeof x.name==='string');renderAttributes();
  $('addAttr').addEventListener('click',()=>{
    const name=$('attrName').value.trim().replace(/\s+/g,'_').slice(0,30),value=$('attrValue').value.trim().slice(0,60);
    if(!name||!value){tell('Nhập tên và giá trị thuộc tính.');return;}
    if(attrList.length>=8){tell('Tối đa 8 thuộc tính bổ sung.');return;}
    attrList=attrList.filter(a=>a.name!==name);attrList.push({name,value});
    putCfg('attrs',JSON.stringify(attrList));$('attrName').value='';$('attrValue').value='';renderAttributes();
  });
  $('attrValue').addEventListener('keydown',e=>{if(e.key==='Enter')$('addAttr').click();});
}
function renderAttributes(){
  const area=$('attrList');area.replaceChildren();
  for(const a of attrList){
    const el=document.createElement('span');el.className='attr-chip';el.textContent=a.name+': '+a.value;
    const x=document.createElement('button');x.textContent='×';x.title='Xóa thuộc tính';
    x.addEventListener('click',()=>{attrList=attrList.filter(t=>t.name!==a.name);putCfg('attrs',JSON.stringify(attrList));renderAttributes();});
    el.appendChild(x);area.appendChild(el);
  }
}
function attributeObject(){return Object.fromEntries(attrList.map(a=>[a.name,a.value]));}

async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia){tell('Camera yêu cầu HTTPS hoặc localhost.');return;}
  stopCamera();
  const width=+$('quality').value;
  const constraints={audio:false,video:{facingMode:{ideal:rearCamera?'environment':'user'},width:{ideal:width},height:{ideal:Math.round(width*9/16)},frameRate:{ideal:30,max:30}}};
  try{
    stream=await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject=stream;await video.play();
    $('emptyView').hidden=true;$('capture').disabled=false;$('openCamera').textContent='Dừng camera';$('switchCam').hidden=false;
    $('resolution').textContent=video.videoWidth+' × '+video.videoHeight;
    setCanvasSize(video.videoWidth,video.videoHeight);
    manualBoxes=[];liveBoxes=[];
    renderTimer=setInterval(analyzeFrame,420);
    analyzeFrame();lastCameraError='';
  }catch(err){
    lastCameraError=err?.message||String(err);
    $('emptyView').hidden=false;$('emptyView').querySelector('div:nth-child(2)').textContent='Không mở được camera';
    tell('Lỗi camera: '+lastCameraError);
    stopCamera();
  }
}
function stopCamera(){
  endHold();if(renderTimer){clearInterval(renderTimer);renderTimer=null;}
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  video.srcObject=null;$('capture').disabled=true;$('openCamera').textContent='Mở camera';$('switchCam').hidden=true;
  $('emptyView').hidden=false;$('resolution').textContent='CAMERA OFF';
  liveBoxes=[];manualBoxes=[];drawOverlay();
}
function setCanvasSize(w,h){overlay.width=w;overlay.height=h;}
function analyzeFrame(){
  if(!stream||!video.videoWidth||document.hidden)return;
  if(overlay.width!==video.videoWidth||overlay.height!==video.videoHeight)setCanvasSize(video.videoWidth,video.videoHeight);
  if(autoMode){
    try{liveBoxes=detectColorTomatoes(video,$('ripeness').value,384);}catch(err){console.warn('Detector',err);}
  }else{liveBoxes=[];}
  drawOverlay();
}
function drawOverlay(){
  ctx.clearRect(0,0,overlay.width,overlay.height);
  const boxes=autoMode?liveBoxes:manualBoxes;
  const scale=overlay.width/384;
  for(let i=0;i<boxes.length;i++){
    const b=boxes[i];ctx.strokeStyle='#f6f6f6';ctx.lineWidth=Math.max(2,scale*1.5);
    ctx.strokeRect(b.x,b.y,b.w,b.h);
    const size=Math.max(20,scale*12),pad=scale*5;
    ctx.font=`600 ${size}px -apple-system, sans-serif`;
    const label='Tomato '+(i+1),tw=ctx.measureText(label).width;
    ctx.fillStyle='#171717';ctx.fillRect(b.x,Math.max(0,b.y-size-pad*2),tw+pad*2,size+pad*2);
    ctx.fillStyle='#fff';ctx.fillText(label,b.x+pad,Math.max(size,b.y-pad));
  }
  if(dragging?.which==='preview'){
    const b=dragBox(dragging.start,dragging.current);ctx.strokeStyle='#fff';ctx.setLineDash([10,7]);ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.setLineDash([]);
  }
  $('cameraBottom').textContent=autoMode?`Lọc màu thử nghiệm · ${boxes.length} vùng · chưa dùng AI`:`Vẽ khung bằng ngón tay · ${boxes.length} vùng`;
}
function framePos(e,elem,w,h){
  const r=elem.getBoundingClientRect(),s=Math.min(r.width/w,r.height/h);
  const left=r.left+(r.width-w*s)/2,top=r.top+(r.height-h*s)/2;
  const x=(e.clientX-left)/s,y=(e.clientY-top)/s;
  return{x:Math.min(w,Math.max(0,x)),y:Math.min(h,Math.max(0,y)),valid:x>=0&&y>=0&&x<=w&&y<=h};
}
function dragBox(a,b){return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)};}

function addPreviewManual(e){
  if(autoMode||!stream)return;
  e.preventDefault();let p=framePos(e,stage,overlay.width,overlay.height);if(!p.valid)return;
  dragging={which:'preview',start:p,current:p};overlay.setPointerCapture?.(e.pointerId);
}
function movePreviewManual(e){
  if(dragging?.which!=='preview')return;
  dragging.current=framePos(e,stage,overlay.width,overlay.height);drawOverlay();
}
function finishPreviewManual(e){
  if(dragging?.which!=='preview')return;
  const b=dragBox(dragging.start,framePos(e,stage,overlay.width,overlay.height));dragging=null;
  if(b.w>12&&b.h>12){manualBoxes.push({...b,method:'manual'});tell('Đã thêm khung.');}drawOverlay();
}

async function toJpeg(canvas,quality=.87){
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Không mã hóa được ảnh')),'image/jpeg',quality));
}
async function makeThumbnail(canvas){
  const t=document.createElement('canvas');
  const scale=Math.min(1,240/Math.max(canvas.width,canvas.height));
  t.width=Math.max(1,Math.round(canvas.width*scale));
  t.height=Math.max(1,Math.round(canvas.height*scale));
  t.getContext('2d').drawImage(canvas,0,0,t.width,t.height);
  return toJpeg(t,.64);
}
function boxNormalize(box,W,H){return{x:Math.max(0,Math.min(W-1,box.x)),y:Math.max(0,Math.min(H-1,box.y)),w:Math.max(0,Math.min(W-box.x,box.w)),h:Math.max(0,Math.min(H-box.y,box.h))};}
async function snapPhoto(){
  if(!stream||!video.videoWidth||snapping)return;
  snapping=true;const button=$('capture');
  try{
    const W=video.videoWidth,H=video.videoHeight,c=document.createElement('canvas');c.width=W;c.height=H;
    c.getContext('2d').drawImage(video,0,0,W,H);
    // Detect on this exact captured frame, not an earlier preview frame.
    const detections=autoMode?detectColorTomatoes(c,$('ripeness').value,384):manualBoxes;
    const boxes=detections.map((b)=>({id:uid(),...boxNormalize(b,W,H),method:b.method||'color',ripeness:$('ripeness').value,disease:$('disease').value,attributes:attributeObject()})).filter(b=>b.w>8&&b.h>8);
    const blob=await toJpeg(c);
    const thumb=await makeThumbnail(c);
    const ts=new Date();const filename='tomato_'+ts.toISOString().replace(/[:.]/g,'-')+'_'+Math.random().toString(36).slice(2,5)+'.jpg';
    await savePhoto({filename,blob,thumb,width:W,height:H,createdAt:ts.toISOString(),boxes,attributes:attributeObject(),captureRipeness:$('ripeness').value,captureDisease:$('disease').value,backupStatus:'pending',exportedAt:'',exportedBatch:''});
    await updateLibrary();
    await maybeAutoExport();
    if(boxes.length===0)tell('Đã lưu ảnh, chưa phát hiện khung. Có thể mở ảnh để vẽ thêm.');
  }catch(err){tell('Lỗi lưu ảnh: '+(err?.message||err));endHold();}
  finally{snapping=false;button.classList.toggle('pressed',holding);}
}
function beginHold(e){
  if($('capture').disabled||holding||!stream)return;
  if(e.type==='pointerdown'&&e.button!==0)return;
  e.preventDefault();holding=true;$('capture').classList.add('pressed');$('capture').setPointerCapture?.(e.pointerId);
  snapPhoto();holdTimer=setInterval(snapPhoto,+$('interval').value||1000);
}
function endHold(){
  holding=false;if(holdTimer){clearInterval(holdTimer);holdTimer=null;}
  $('capture').classList.remove('pressed');
}

function updateSelectionControls(){
  $('selectMode').textContent=selectionMode?'Đóng chọn ảnh':'Chọn ảnh';
  $('selectionActions').hidden=!selectionMode;
  $('selectionStatus').hidden=!selectionMode;
  const num=selectedPhotoIds.size;
  $('selectionStatus').textContent=`Đã chọn ${num} / ${totalCount} ảnh`;
  $('deleteSelected').textContent=`Xóa đã chọn (${num})`;
  $('deleteSelected').disabled=!num;
  $('selectAll').disabled=!totalCount||num===totalCount;
  $('clearSelection').disabled=!num;
}
function toggleSelection(id){
  if(selectedPhotoIds.has(id))selectedPhotoIds.delete(id);else selectedPhotoIds.add(id);
  const btn=$('gallery').querySelector(`[data-photo-id="${id}"]`);
  if(btn){btn.classList.toggle('is-selected',selectedPhotoIds.has(id));btn.setAttribute('aria-pressed',String(selectedPhotoIds.has(id)));}
  updateSelectionControls();
}
async function updateLibrary(){
  if(!db)return;
  totalCount=await countPhotos();
  const pendingCount=await countByBackupStatus('pending');
  const exportedCount=Math.max(0,totalCount-pendingCount);
  $('count').textContent=`${totalCount} ảnh đã lưu · ${pendingCount} chưa sao lưu · ${exportedCount} đã sao lưu`;
  $('batchHelp').textContent=`Tự động tạo ZIP mỗi khi đủ 100 ảnh chưa sao lưu. Hiện còn ${pendingCount} ảnh chưa sao lưu.`;
  const items=await recentPhotos(galleryLimit),gallery=$('gallery');
  galleryUrls.forEach(url=>URL.revokeObjectURL(url));galleryUrls=[];gallery.replaceChildren();
  $('loadMore').hidden=totalCount<=galleryLimit;
  if(!items.length){
    const el=document.createElement('div');el.className='gallery-empty';el.textContent='Chưa có ảnh nào';gallery.appendChild(el);
    updateSelectionControls();return;
  }
  for(const item of items){
    const btn=document.createElement('button');btn.type='button';btn.className='gallery-item';
    btn.dataset.photoId=String(item.id);
    const checked=selectedPhotoIds.has(item.id);
    btn.classList.toggle('is-selected',checked);
    btn.setAttribute('aria-pressed',String(selectionMode&&checked));
    btn.title=(selectionMode?'Chọn ảnh ':'Mở ảnh ')+item.filename;
    const img=document.createElement('img'),url=URL.createObjectURL(item.thumb||item.blob);
    galleryUrls.push(url);img.src=url;img.loading='lazy';img.alt='Ảnh cà chua';
    const n=document.createElement('span');n.className='num';n.textContent=item.boxes.length+' box';
    const check=document.createElement('span');check.className='selection-mark';check.textContent=checked?'✓':'';
    btn.append(img,n,check);
    if(selectionMode)btn.classList.add('is-selectable');
    btn.addEventListener('click',()=>selectionMode?toggleSelection(item.id):openReview(item.id));
    gallery.appendChild(btn);
  }
  updateSelectionControls();
}
function fillChoice(sel,val){$(sel).value=val;}
function redrawReview(){
  if(!photoUnderReview)return;
  const canvas=$('reviewCanvas'),cx=canvas.getContext('2d');cx.clearRect(0,0,canvas.width,canvas.height);
  const scale=canvas.width/390;
  for(let i=0;i<photoUnderReview.boxes.length;i++){
    const b=photoUnderReview.boxes[i];cx.strokeStyle=i===selectedBox?'#fff':'#d4d4d4';cx.lineWidth=(i===selectedBox?3:2)*scale;
    cx.strokeRect(b.x,b.y,b.w,b.h);
    const font=Math.max(17,12*scale),tx=b.x,ty=Math.max(0,b.y-font-5);
    cx.font=`600 ${font}px sans-serif`;const label='#'+(i+1)+' Tomato';const tw=cx.measureText(label).width;
    cx.fillStyle=i===selectedBox?'#f8f8f8':'#171717';cx.fillRect(tx,ty,tw+12*scale,font+6*scale);
    cx.fillStyle=i===selectedBox?'#161616':'#fff';cx.fillText(label,tx+6*scale,ty+font);
  }
  if(dragging?.which==='review'){
    let b=dragBox(dragging.start,dragging.current);cx.strokeStyle='#fff';cx.lineWidth=2*scale;cx.setLineDash([10,7]);cx.strokeRect(b.x,b.y,b.w,b.h);cx.setLineDash([]);
  }
  $('reviewCount').textContent=photoUnderReview.boxes.length+' khung';
  const selected=photoUnderReview.boxes[selectedBox];$('boxTools').hidden=!selected;
  if(selected){fillChoice('boxRipeness',selected.ripeness);fillChoice('boxDisease',selected.disease);}
}
async function openReview(id){
  const item=await getPhoto(id);if(!item)return;
  photoUnderReview=item;originalReviewBoxes=JSON.stringify(item.boxes);selectedBox=item.boxes.length?0:-1;
  if(reviewImageUrl)URL.revokeObjectURL(reviewImageUrl);
  reviewImageUrl=URL.createObjectURL(item.blob);const img=$('reviewImage');
  $('reviewTitle').textContent='Kiểm tra ảnh #'+id;
  img.onload=()=>{const c=$('reviewCanvas');c.width=item.width;c.height=item.height;redrawReview();};
  img.src=reviewImageUrl;$('reviewModal').hidden=false;
}
function closeReview(){
  photoUnderReview=null;selectedBox=-1;dragging=null;$('reviewModal').hidden=true;
  if(reviewImageUrl){URL.revokeObjectURL(reviewImageUrl);reviewImageUrl=null;}
}
function reviewPointerDown(e){
  if(!photoUnderReview)return;e.preventDefault();
  const p=framePos(e,$('reviewStage'),photoUnderReview.width,photoUnderReview.height);if(!p.valid)return;
  dragging={which:'review',start:p,current:p};$('reviewCanvas').setPointerCapture?.(e.pointerId);
}
function reviewPointerMove(e){
  if(dragging?.which!=='review')return;
  dragging.current=framePos(e,$('reviewStage'),photoUnderReview.width,photoUnderReview.height);redrawReview();
}
function reviewPointerEnd(e){
  if(dragging?.which!=='review')return;
  const end=framePos(e,$('reviewStage'),photoUnderReview.width,photoUnderReview.height);
  const b=dragBox(dragging.start,end);dragging=null;
  if(b.w>16&&b.h>16){
    photoUnderReview.boxes.push({...b,id:uid(),method:'manual',ripeness:$('ripeness').value,disease:$('disease').value,attributes:attributeObject()});
    selectedBox=photoUnderReview.boxes.length-1;
  }else{
    selectedBox=-1;
    for(let i=photoUnderReview.boxes.length-1;i>=0;i--){let v=photoUnderReview.boxes[i];if(end.x>=v.x&&end.y>=v.y&&end.x<=v.x+v.w&&end.y<=v.y+v.h){selectedBox=i;break;}}
  }
  redrawReview();
}

function annotationResultForBox(b,W,H){
  const common={original_width:W,original_height:H,image_rotation:0,id:b.id,to_name:'image',origin:b.method==='manual'?'manual':'prediction'};
  const valueBox={x:100*b.x/W,y:100*b.y/H,width:100*b.w/W,height:100*b.h/H,rotation:0};
  return [
    {...common,from_name:'tomato_bbox',type:'rectanglelabels',value:{...valueBox,rectanglelabels:['Tomato']}},
    {...common,from_name:'ripeness',type:'choices',value:{...valueBox,choices:[b.ripeness]}},
    {...common,from_name:'disease',type:'choices',value:{...valueBox,choices:[b.disease]}}
  ];
}
function exportLabelStudio(records){
  return records.map((rec,index)=>({
    id:rec.id,annotations:[{id:rec.id,completed_by:null,result:rec.boxes.flatMap(b=>annotationResultForBox(b,rec.width,rec.height)),was_cancelled:false,ground_truth:false,created_at:rec.createdAt,updated_at:rec.createdAt,result_count:rec.boxes.length}],
    file_upload:rec.filename,data:{image:'images/'+rec.filename},meta:{source:'Tomato Collector PWA',image_width:rec.width,image_height:rec.height,capture_ripeness:rec.captureRipeness,capture_disease:rec.captureDisease,attributes:rec.attributes,objects:rec.boxes.map(b=>({id:b.id,bbox_method:b.method,attributes:b.attributes}))},
    created_at:rec.createdAt,updated_at:rec.createdAt,total_annotations:1,inner_id:index+1
  }));
}

// Offline ZIP writer: STORE method only (JPEG is already compressed).
const enc = new TextEncoder();
const CRC_TABLE=Uint32Array.from({length:256},(_,i)=>{
  let c=i;
  for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);
  return c>>>0;
});
function crc32Chunk(data,c){
  for(const v of data)c=CRC_TABLE[(c^v)&0xff]^(c>>>8);
  return c>>>0;
}
async function crc32Blob(blob){
  // Read at most 256 KiB each time: 500 JPEGs need not be loaded into RAM together.
  const chunkSize=256*1024;
  let c=0xffffffff;
  for(let start=0;start<blob.size;start+=chunkSize){
    const bytes=new Uint8Array(await blob.slice(start,Math.min(start+chunkSize,blob.size)).arrayBuffer());
    c=crc32Chunk(bytes,c);
  }
  return (c^0xffffffff)>>>0;
}
function zipHeader(n){return new DataView(new ArrayBuffer(n));}
function zipLocal(name,crc,size){
  const d=zipHeader(30);d.setUint32(0,0x04034b50,true);d.setUint16(4,20,true);d.setUint16(6,0x0800,true);
  d.setUint16(8,0,true);d.setUint32(14,crc,true);d.setUint32(18,size,true);d.setUint32(22,size,true);d.setUint16(26,name.length,true);
  return new Uint8Array(d.buffer);
}
function zipCentral(name,crc,size,offset){
  const d=zipHeader(46);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x0800,true);
  d.setUint16(10,0,true);d.setUint32(16,crc,true);d.setUint32(20,size,true);d.setUint32(24,size,true);d.setUint16(28,name.length,true);
  d.setUint32(42,offset,true);return new Uint8Array(d.buffer);
}
async function createZip(entries,onProgress){
  const parts=[],central=[];let offset=0,centralLen=0;
  if(entries.length>65535)throw Error('Quá nhiều tệp trong ZIP');
  for(const [index,item] of entries.entries()){
    const name=enc.encode(item.name);
    const data=item.data instanceof Blob?item.data:new Blob([enc.encode(item.data)]);
    if(data.size>0xffffffff)throw Error('Tệp quá lớn để tạo ZIP');
    const crc=await crc32Blob(data),local=zipLocal(name,crc,data.size);
    // Keep JPEG as Blob, avoiding conversion of every full image to a JS byte array.
    parts.push(local,name,data);central.push(zipCentral(name,crc,data.size,offset),name);
    offset+=local.length+name.length+data.size;centralLen+=46+name.length;
    if(offset>0xffffffff)throw Error('ZIP quá lớn (giới hạn 4 GB)');
    if(index%10===0||index===entries.length-1)onProgress?.(index+1,entries.length);
  }
  const e=zipHeader(22);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);
  e.setUint32(12,centralLen,true);e.setUint32(16,offset,true);
  return new Blob([...parts,...central,new Uint8Array(e.buffer)],{type:'application/zip'});
}
function nextZipSequence(){
  const current=+(getCfg('zipSeq','1'))||1;
  putCfg('zipSeq',String(current+1));
  return current;
}
function triggerDownload(url,filename){
  const link=$('downloadLink');
  link.href=url;link.download=filename;
  link.textContent=`Tải ${filename} ↓`;
  $('downloadArea').hidden=false;
  requestAnimationFrame(()=>link.click());
}
async function exportPendingZip(options={}){
  const auto=!!options.auto;
  if(exportInProgress)return false;
  const pendingCount=await countByBackupStatus('pending');
  if(!pendingCount){
    if(!auto)tell('Không còn ảnh chưa sao lưu.');
    return false;
  }
  const limit=auto?100:Math.min(100,pendingCount);
  exportInProgress=true;
  $('exportBtn').disabled=true;
  $('exportBtn').textContent=auto?'Đang tự sao lưu…':'Đang tạo…';
  try{
    const records=await pendingPhotos(limit);
    if(!records.length)throw Error('Không có ảnh chờ sao lưu');
    const bytes=records.reduce((total,rec)=>total+rec.blob.size,0);
    if(!auto&&bytes>150*1024*1024&&!confirm(`Lô này khoảng ${(bytes/1048576).toFixed(0)} MB. Trên iPhone 11, xuất ZIP quá lớn có thể khiến Safari đóng đột ngột. Vẫn xuất ${records.length} ảnh?`))return false;
    const json=JSON.stringify(exportLabelStudio(records),null,2);
    const txt='Tomato Collector — Bản demo offline

- images/: ảnh JPG gốc
- label.json: bounding box, ripeness, disease theo cấu trúc Label Studio
- Tọa độ x/y/w/h trong JSON: phần trăm khung hình (0-100)
- Thuật toán auto trong bản demo chỉ dựa vào màu, cần duyệt/chỉnh nhãn trước khi train.
- Muốn nhập Label Studio, phải cấu hình đường dẫn data.image tương ứng hệ thống lưu ảnh của bạn.
- Ảnh lưu cục bộ trên iPhone không bị xóa sau khi xuất ZIP.
';
    const entries=[{name:'label.json',data:json},{name:'README.txt',data:txt},...records.map(rec=>({name:'images/'+rec.filename,data:rec.blob}))];
    const blob=await createZip(entries,(completed,total)=>{
      $('exportBtn').textContent=`${auto?'Đang tự sao lưu':'Đang tạo'} ${completed}/${total}…`;
    });
    if(lastDownloadUrl)URL.revokeObjectURL(lastDownloadUrl);
    lastDownloadUrl=URL.createObjectURL(blob);
    const seq=nextZipSequence();
    const filename=`tomato_dataset_${String(seq).padStart(4,'0')}_${String(records.length).padStart(3,'0')}imgs.zip`;
    await markPhotosBackedUp(records.map(r=>r.id),filename);
    triggerDownload(lastDownloadUrl,filename);
    if(auto)tell(`Đủ 100 ảnh, đã tự tạo ${filename}. Nếu iPhone hỏi, hãy chọn Lưu vào Tệp.`);
    else tell(`Đã tạo ${filename}. Nếu iPhone hỏi, hãy chọn Lưu vào Tệp.`);
    await updateLibrary();
    return true;
  }catch(err){
    tell('Không thể tạo ZIP: '+(err?.message||err));
    return false;
  }finally{
    exportInProgress=false;
    $('exportBtn').disabled=false;
    $('exportBtn').textContent='Tải ảnh chưa sao lưu';
  }
}
async function maybeAutoExport(){
  if(exportInProgress||autoExportQueued)return;
  const pendingCount=await countByBackupStatus('pending');
  if(pendingCount<100)return;
  autoExportQueued=true;
  try{
    while(await countByBackupStatus('pending')>=100){
      const ok=await exportPendingZip({auto:true});
      if(!ok)break;
    }
  }finally{autoExportQueued=false;}
}

async function boot(){
  readSettings();
  $('openCamera').addEventListener('click',()=>stream?stopCamera():startCamera());
  $('switchCam').addEventListener('click',()=>{rearCamera=!rearCamera;startCamera();});
  $('quality').addEventListener('change',()=>{if(stream)startCamera();});
  $('autoDetect').addEventListener('change',e=>{autoMode=e.target.checked;manualBoxes=[];liveBoxes=[];drawOverlay();});
  $('ripeness').addEventListener('change',()=>{liveBoxes=[];analyzeFrame();});
  overlay.addEventListener('pointerdown',addPreviewManual);overlay.addEventListener('pointermove',movePreviewManual);
  overlay.addEventListener('pointerup',finishPreviewManual);overlay.addEventListener('pointercancel',finishPreviewManual);
  $('capture').addEventListener('pointerdown',beginHold);$('capture').addEventListener('pointerup',endHold);
  $('capture').addEventListener('pointercancel',endHold);$('capture').addEventListener('lostpointercapture',endHold);
  $('capture').addEventListener('contextmenu',e=>e.preventDefault());
  $('capture').addEventListener('keydown',e=>{if((e.code==='Space'||e.code==='Enter')&&!holding)beginHold(e);});
  $('capture').addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter')endHold();});
  window.addEventListener('blur',endHold);document.addEventListener('visibilitychange',()=>{if(document.hidden)endHold();});
  $('exportBtn').addEventListener('click',()=>exportPendingZip({auto:false}));
  $('selectMode').addEventListener('click',async()=>{
    selectionMode=!selectionMode;
    if(!selectionMode)selectedPhotoIds.clear();
    await updateLibrary();
  });
  $('selectAll').addEventListener('click',async()=>{
    try{
      const ids=await allPhotoIds();
      selectedPhotoIds.clear();ids.forEach(id=>selectedPhotoIds.add(id));
      await updateLibrary();
    }catch(err){tell('Không chọn được tất cả ảnh: '+err.message);}
  });
  $('clearSelection').addEventListener('click',async()=>{selectedPhotoIds.clear();await updateLibrary();});
  $('deleteSelected').addEventListener('click',async()=>{
    const ids=[...selectedPhotoIds];
    if(!ids.length)return;
    if(!confirm(`Xóa vĩnh viễn ${ids.length} ảnh đã chọn cùng nhãn? Hãy xuất ZIP sao lưu trước khi xóa.`))return;
    $('deleteSelected').disabled=true;
    try{
      await deletePhotos(ids);
      selectedPhotoIds.clear();
      invalidateZip();
      await updateLibrary();tell(`Đã xóa ${ids.length} ảnh.`);
    }catch(err){tell('Lỗi xóa nhiều ảnh: '+(err?.message||err));updateSelectionControls();}
  });
  $('loadMore').addEventListener('click',async()=>{
    galleryLimit+=GALLERY_PAGE_SIZE;await updateLibrary();
  });
  $('closeReview').addEventListener('click',closeReview);
  $('reviewCanvas').addEventListener('pointerdown',reviewPointerDown);$('reviewCanvas').addEventListener('pointermove',reviewPointerMove);
  $('reviewCanvas').addEventListener('pointerup',reviewPointerEnd);$('reviewCanvas').addEventListener('pointercancel',()=>{dragging=null;redrawReview();});
  for(const [sel,key] of [['boxRipeness','ripeness'],['boxDisease','disease']]){
    $(sel).addEventListener('change',e=>{if(photoUnderReview&&selectedBox>=0)photoUnderReview.boxes[selectedBox][key]=e.target.value;});
  }
  $('removeBox').addEventListener('click',()=>{if(photoUnderReview&&selectedBox>=0){photoUnderReview.boxes.splice(selectedBox,1);selectedBox=-1;redrawReview();}});
  $('saveReview').addEventListener('click',async()=>{
    if(!photoUnderReview)return;try{await savePhoto(photoUnderReview);closeReview();await updateLibrary();tell('Đã lưu nhãn chỉnh sửa.');}
    catch(err){tell('Lỗi lưu chỉnh sửa: '+err.message);}
  });
  $('deletePhoto').addEventListener('click',async()=>{
    if(!photoUnderReview||!confirm('Xóa vĩnh viễn ảnh này và tất cả nhãn?'))return;
    await deletePhoto(photoUnderReview.id);selectedPhotoIds.delete(photoUnderReview.id);closeReview();invalidateZip();await updateLibrary();tell('Đã xóa ảnh.');
  });
  $('clearAll').addEventListener('click',async()=>{
    if(!totalCount||!confirm('Xóa tất cả '+totalCount+' ảnh đã lưu trên máy? Hãy xuất ZIP trước.')||!confirm('Xác nhận lần 2: xóa vĩnh viễn tất cả?'))return;
    await clearPhotos();selectedPhotoIds.clear();invalidateZip();await updateLibrary();tell('Đã xóa tất cả ảnh.');
  });
  try{db=await openDatabase();await updateLibrary();}catch(e){tell('Không mở được bộ nhớ offline: '+(e?.message||e));$('capture').disabled=true;$('openCamera').disabled=true;}
  if('serviceWorker' in navigator){
    try{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;
      $('modeBadge').innerHTML='<span class="status-dot"></span>Đã cài offline';
    }catch(err){console.warn('Service Worker',err);$('modeBadge').textContent='Cần HTTPS';}
  }else{$('modeBadge').textContent='Cần HTTPS';}
  if(navigator.storage?.persist){try{navigator.storage.persist();}catch{}}
}
boot();
