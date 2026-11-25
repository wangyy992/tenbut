"use client";
import {useEffect} from 'react';
let eventId='';
export default function VisitTracker(){useEffect(()=>{
 if(!eventId)eventId=crypto.randomUUID();
 fetch('/api/visit',{method:'POST',headers:{'X-Visit-Id':eventId},keepalive:true}).catch(()=>{});
},[]);return null;}
