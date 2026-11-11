/**
 * Demo-only deterministic color blob finder. NOT a trained model.
 * Coordinates returned in source-canvas pixel space.
 */
const work = document.createElement('canvas');
const wc = work.getContext('2d', { willReadFrequently: true });

export function detectColorTomatoes(source, preferred = 'Ripe', inferenceWidth = 384) {
  const W = source.videoWidth || source.naturalWidth || source.width;
  const H = source.videoHeight || source.naturalHeight || source.height;
  if (!W || !H) return [];
  const w = Math.max(64, Math.round(Math.min(inferenceWidth, W)));
  const h = Math.max(64, Math.round(w * H / W));
  work.width = w; work.height = h;
  wc.drawImage(source, 0, 0, w, h);
  const pixels = wc.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let y = 1; y < h-1; y++) {
    for (let x = 1; x < w-1; x++) {
      const idx = y*w+x, k=idx*4;
      const r=pixels[k], g=pixels[k+1], b=pixels[k+2];
      const reddish = r>78 && r>g*1.28 && r>b*1.24 && (r-g)>30;
      const greenish = g>62 && g>r*1.20 && g>b*1.17 && (g-r)>17;
      mask[idx]=(preferred==='Unripe')?+greenish:(preferred==='Semi_Ripe')?+(reddish||greenish):+reddish;
    }
  }
  // Small morphological closing to fill 1-2 pixel gaps and prevent speckles.
  const dilated = new Uint8Array(mask.length);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const i=y*w+x;
    dilated[i]=+(mask[i]||mask[i-1]||mask[i+1]||mask[i-w]||mask[i+w]||mask[i-w-1]||mask[i-w+1]||mask[i+w-1]||mask[i+w+1]);
  }
  const closed = new Uint8Array(mask.length);
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
    const i=y*w+x;
    closed[i]=+(dilated[i]&&dilated[i-1]&&dilated[i+1]&&dilated[i-w]&&dilated[i+w]);
  }
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const found = [];
  const minArea=Math.max(110,Math.floor(w*h*.0028));
  for(let y=2;y<h-2;y+=2){
    for(let x=2;x<w-2;x+=2){
      const start=y*w+x;
      if(!closed[start]||visited[start])continue;
      let head=0,tail=1,area=0,minX=x,minY=y,maxX=x,maxY=y;
      queue[0]=start; visited[start]=1;
      while(head<tail){
        const i=queue[head++],cy=(i/w)|0,cx=i-cy*w;
        area++; if(cx<minX)minX=cx;if(cx>maxX)maxX=cx;if(cy<minY)minY=cy;if(cy>maxY)maxY=cy;
        for(const n of [i-1,i+1,i-w,i+w]){
          if(n<0||n>=mask.length||visited[n]||!closed[n])continue;
          visited[n]=1;queue[tail++]=n;
        }
      }
      const bw=maxX-minX+1,bh=maxY-minY+1,ratio=bw/bh,fill=area/(bw*bh);
      if(area<minArea||bw<14||bh<14||ratio<.52||ratio>1.95||fill<.32)continue;
      if(bw>w*.96||bh>h*.96)continue;
      // Loosen the box for brightness gaps along the fruit edge.
      const pad=Math.max(2,Math.round(Math.min(bw,bh)*.055));
      const x1=Math.max(0,minX-pad),y1=Math.max(0,minY-pad);
      const x2=Math.min(w,maxX+1+pad),y2=Math.min(h,maxY+1+pad);
      found.push({x:x1*W/w,y:y1*H/h,w:(x2-x1)*W/w,h:(y2-y1)*H/h,method:'color'});
    }
  }
  return found.sort((a,b)=>b.w*b.h-a.w*a.h).slice(0,30);
}
