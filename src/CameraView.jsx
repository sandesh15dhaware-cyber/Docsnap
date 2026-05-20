import {C} from "./config.js";
export default function CameraView({videoRef,pages,stopCamera,capturePhoto}){
return(<div style={{height:"100vh",background:"#000",fontFamily:"'Inter',sans-serif",position:"relative"}}>
<video ref={videoRef} autoPlay playsInline muted style={{position:"absolute",inset:0,objectFit:"cover",width:"100%",height:"100%"}}/>
<div style={{position:"absolute",top:0,left:0,right:0,padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
<button className="ds-btn" onClick={stopCamera} style={{background:"#111a",backdropFilter:"blur(12px)",color:C.white,padding:"10px 18px",borderRadius:12,fontSize:14,fontWeight:500}}>✕ Close</button>
<div style={{background:"#111a",backdropFilter:"blur(12px)",color:C.white,padding:"8px 16px",borderRadius:12,fontSize:13,fontWeight:600}}>{pages.length} pages</div>
</div>
<div style={{position:"absolute",bottom:0,left:0,right:0,padding:"20px 0 40px",display:"flex",justifyContent:"center",background:"linear-gradient(transparent,#000a)"}}>
<button className="ds-btn" onClick={capturePhoto} style={{width:76,height:76,borderRadius:"50%",background:C.white,border:"4px solid "+C.accent,boxShadow:"0 4px 20px #0006"}}/>
</div></div>)}
