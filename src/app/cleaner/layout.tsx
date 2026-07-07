import type { ReactNode } from 'react';
import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';
import NotificationBadge from '@/components/NotificationBadge';
import { color, spacing, radius, font } from '@/lib/theme';
const navLinkStyle = {color:color.textInverse,textDecoration:'none',fontWeight:font.weight.bold,fontSize:font.size.sm,padding:`${spacing.sm}px ${spacing.md}px`,borderRadius:radius.md,border:`1px solid ${color.overlayBorder}`,background:color.overlayBg};
const BrandBar = () => (<header style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 20px',borderBottom:`1px solid ${color.overlayBorder}`,background:'linear-gradient(180deg,rgba(27,43,78,0.9) 0%,rgba(11,18,32,0.95) 100%)'}}><div style={{display:'flex',flexDirection:'column',gap:2}}><div style={{fontWeight:font.weight.heavy,color:color.white}}>FM Pro Cleaning</div><div style={{fontSize:font.size.sm,color:color.overlayTextMuted}}>Cleaner portal</div></div><nav style={{display:'flex',gap:spacing.md,alignItems:'center'}}><Link href="/cleaner" style={navLinkStyle}>Home</Link><Link href="/cleaner/inbox" style={navLinkStyle}>Inbox</Link><NotificationBadge href="/cleaner/inbox" style={{color:color.textInverse}} /><LogoutButton style={navLinkStyle} /></nav></header>);
export default function CleanerLayout({children}:{children:ReactNode}){return(<div style={{minHeight:'100vh',background:color.navyBlack,color:color.textInverse}}><BrandBar/><div style={{maxWidth:1100,margin:'0 auto',padding:`${spacing.xl}px ${spacing.lg}px`}}>{children}</div></div>);}
