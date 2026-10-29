import { ImageResponse } from "next/og";
import { FluxoraMark } from "../components/brand/fluxora-mark";
export const alt = "Fluxora — Good work. On autopilot.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function SocialImage() {
  return new ImageResponse(<div style={{ display:"flex",flexDirection:"column",width:"100%",height:"100%",background:"#050706",color:"#f3f6ec",padding:70,fontFamily:"sans-serif",borderBottom:"8px solid #d6ff32" }}>
    <div style={{ display:"flex",alignItems:"center",gap:18,fontSize:32 }}><FluxoraMark size={52}/>Fluxora</div>
    <div style={{display:"flex",flexDirection:"column",fontSize:84,letterSpacing:-4,marginTop:65,lineHeight:1.08}}><span>Good work.</span><span style={{color:"#d6ff32"}}>On autopilot.</span></div>
    <div style={{display:"flex",fontSize:25,color:"#a8b3a4",marginTop:40}}>Connect your apps. Keep every workflow in view.</div>
    <div style={{display:"flex",fontSize:18,color:"#a8b3a4",marginTop:40}}>fluxora.io.vn</div>
  </div>,size);
}
