// Shared chassis coordinates: X right, Y up, Z forward; metres.
export const VEHICLE = Object.freeze({wheelRadius:.355,wheelWidth:.29,wheelbase:2.78,track:1.7,archCenterY:-.145,length:4.65});
export const NOZZLES = [
  ...[-1,1].flatMap(side=>[-1,1].map(end=>({position:[side*.67,-.245,end*1.18],direction:[0,-1,0],kind:'lift',side,end}))),
  ...[-1,1].map(side=>({position:[side*.63,.04,-2.315],direction:[0,0,-1],kind:'boost',side})),
  ...[-1,1].flatMap(side=>[-1,1].map(end=>({position:[side*.985,.05,end*.93],direction:[side,0,0],kind:'attitude',side,end}))),
];
