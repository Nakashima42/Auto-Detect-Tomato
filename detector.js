/**
 * Lightweight, OFFLINE, color/shape-based tomato candidate detector.
 * This is not a trained ML model and cannot reliably separate green fruit
 * from similarly colored leaves in complex outdoor scenes.
 *
 * The user's ripeness selection is used only to LABEL photographs. Detection
 * always searches red, yellow/orange and green fruit independently of label.
 * Coordinates are returned in source-image pixels.
 */
const work = document.createElement('canvas');
const wc = work.getContext('2d', { willReadFrequently: true });

// 3x3 morphology removes thin leaf-like fragments and fills small holes.
function morph3(src, w, h, erode) {
  const out = new Uint8Array(src.length);
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      let n = 0;
      n += src[i-w-1] + src[i-w] + src[i-w+1];
      n += src[i-1]   + src[i]   + src[i+1];
      n += src[i+w-1] + src[i+w] + src[i+w+1];
      out[i] = erode ? +(n === 9) : +(n !== 0);
    }
  }
  return out;
}

function smoothMask(mask, w, h) {
  // Opening first removes isolated narrow stems; closing reconnects skin regions.
  const opened = morph3(morph3(mask,w,h,true),w,h,false);
  return morph3(morph3(opened,w,h,false),w,h,true);
}

function extractBlobs(mask, w, h, sx, sy, kind, high) {
  const seen = new Uint8Array(mask.length), queue = new Int32Array(mask.length);
  const boxes=[];
  const minArea = Math.max(high ? 65 : 115, Math.round(w*h*(high ? .0010 : .0019)));
  for(let y=2;y<h-2;y+=2)for(let x=2;x<w-2;x+=2){
    const start = y*w+x;
    if(seen[start] || !mask[start])continue;
    seen[start]=1;queue[0]=start;
    let head=0,tail=1,area=0,perim=0;
    let minX=x,minY=y,maxX=x,maxY=y;
    while(head<tail){
      const i=queue[head++], cy=(i/w)|0, cx=i-cy*w;
      area++;
      if(cx<minX)minX=cx;if(cx>maxX)maxX=cx;
      if(cy<minY)minY=cy;if(cy>maxY)maxY=cy;
      // 4-connected traversal. No array allocation inside the hot loop.
      let n=i-1;
      if(cx===0 || !mask[n])perim++; else if(!seen[n]){seen[n]=1;queue[tail++]=n;}
      n=i+1;
      if(cx===w-1 || !mask[n])perim++; else if(!seen[n]){seen[n]=1;queue[tail++]=n;}
      n=i-w;
      if(cy===0 || !mask[n])perim++; else if(!seen[n]){seen[n]=1;queue[tail++]=n;}
      n=i+w;
      if(cy===h-1 || !mask[n])perim++; else if(!seen[n]){seen[n]=1;queue[tail++]=n;}
    }
    const bw=maxX-minX+1,bh=maxY-minY+1;
    if(area<minArea || bw<(high?12:15) || bh<(high?12:15))continue;
    const ratio=bw/bh,fill=area/(bw*bh);
    const circularity=4*Math.PI*area/(perim*perim);
    // These filters reject elongated stems/leaves and huge green backgrounds.
    if(ratio<(high?.49:.58) || ratio>(high?2.05:1.82))continue;
    if(fill<(high?.42:.51) || circularity<(high?.23:.30))continue;
    if(bw>w*.90 || bh>h*.90 || area>w*h*.42)continue;
    const pad=Math.max(2,Math.round(Math.min(bw,bh)*.055));
    const x1=Math.max(0,minX-pad),y1=Math.max(0,minY-pad);
    const x2=Math.min(w,maxX+pad+1),y2=Math.min(h,maxY+pad+1);
    boxes.push({x:x1*sx,y:y1*sy,w:(x2-x1)*sx,h:(y2-y1)*sy,method:'color',colorHint:kind});
  }
  return boxes;
}

function intersectionOverUnion(a,b){
  const x1=Math.max(a.x,b.x),y1=Math.max(a.y,b.y),x2=Math.min(a.x+a.w,b.x+b.w),y2=Math.min(a.y+a.h,b.y+b.h);
  const inter=Math.max(0,x2-x1)*Math.max(0,y2-y1);
  return inter/Math.max(1,a.w*a.h+b.w*b.h-inter);
}
function collapseDuplicates(boxes){
  const sorted=boxes.sort((a,b)=>b.w*b.h-a.w*a.h),out=[];
  for(const b of sorted){
    if(out.some(a=>intersectionOverUnion(a,b)>.40))continue;
    out.push(b);
    if(out.length>=30)break;
  }
  return out;
}

export function detectColorTomatoes(source, _ripenessForCompatibility='Ripe', inferenceWidth=384, sensitivity='balanced') {
  const W=source.videoWidth||source.naturalWidth||source.width;
  const H=source.videoHeight||source.naturalHeight||source.height;
  if(!W||!H)return [];
  const w=Math.max(64,Math.min(inferenceWidth,W));
  const h=Math.max(64,Math.round(w*H/W));
  work.width=w;work.height=h;
  wc.drawImage(source,0,0,w,h);
  const pixels=wc.getImageData(0,0,w,h).data;
  const warm=new Uint8Array(w*h),green=new Uint8Array(w*h);
  const high=sensitivity==='high';
  const minV=high?44:52,minS=high?.105:.15;
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      const i=y*w+x,k=i*4;
      const r=pixels[k],g=pixels[k+1],b=pixels[k+2];
      const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
      if(max<minV||delta<max*minS)continue;
      let hue;
      if(max===r)hue=((g-b)/delta+6)%6;
      else if(max===g)hue=(b-r)/delta+2;
      else hue=(r-g)/delta+4;
      hue*=60;
      // Red, orange, yellow and yellow-green. Prevent bluish backgrounds.
      if(hue<=72||hue>=345)warm[i]=1;
      // Both light and dark green fruit. Foliage can look identical: shape check is only heuristic.
      else if(hue<=178)green[i]=1;
    }
  }
  const sx=W/w,sy=H/h;
  const boxes=[
    ...extractBlobs(smoothMask(warm,w,h),w,h,sx,sy,'red/yellow',high),
    ...extractBlobs(smoothMask(green,w,h),w,h,sx,sy,'green',high)
  ];
  return collapseDuplicates(boxes);
}
