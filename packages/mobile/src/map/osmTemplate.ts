// Pure OSM/Leaflet page template — zero React Native imports so it stays
// unit-testable under plain node/jest. SafeMapView renders its output.
export interface SafeMapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MarkerSpec {
  latitude: number;
  longitude: number;
  title?: string;
  color?: string;
}

// Free OSM tiles to swap in later (all {z}/{x}/{y} compatible):
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const PIN_COLORS: Record<string, string> = { green: '#22c55e', red: '#ef4444', blue: '#3b82f6' };

export function zoomForDelta(delta: number): number {
  const z = Math.round(Math.log2(360 / Math.max(0.001, delta)));
  return Math.min(19, Math.max(2, z));
}

export interface RouteSpec {
  from: { latitude: number; longitude: number };
  to: { latitude: number; longitude: number };
}

export function pageHtml(region: SafeMapRegion, markers: MarkerSpec[], route?: RouteSpec | null): string {
  const zoom = zoomForDelta(region.latitudeDelta);
  const initialRoute = route ? JSON.stringify(route) : 'null';
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />` +
    `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />` +
    `<style>html,body,#m{height:100%;margin:0;padding:0}.leaflet-control-attribution{font-size:9px}</style></head><body>` +
    `<div id="m"></div>` +
    `<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>` +
    `window.ReactNativeWebView=window.ReactNativeWebView||{postMessage:function(d){window.parent.postMessage(d,'*');}};` +
    `var map=L.map('m',{zoomControl:false,attributionControl:true}).setView([${region.latitude},${region.longitude}],${zoom});` +
    `L.tileLayer('${TILE_URL}',{maxZoom:19,attribution:'${TILE_ATTR}'}).addTo(map);` +
    `var layer=L.layerGroup().addTo(map);` +
    `function draw(m){layer.clearLayers();(m||[]).forEach(function(p){` +
    `L.circleMarker([p.latitude,p.longitude],{radius:9,color:p.color||'#ef4444',weight:2,fillColor:p.color||'#ef4444',fillOpacity:0.55})` +
    `.addTo(layer).bindTooltip(p.title||'',{permanent:false});});}` +
    `draw(${JSON.stringify(markers)});` +
    `function post(){var c=map.getCenter(),z=map.getZoom(),d=360/Math.pow(2,z);` +
    `window.ReactNativeWebView.postMessage(JSON.stringify({kind:'region',latitude:c.lat,longitude:c.lng,latitudeDelta:d,longitudeDelta:d}));}` +
    `map.on('moveend',post);map.on('zoomend',post);` +
    `map.on('click',function(e){if(!e||!e.latlng)return;window.ReactNativeWebView.postMessage(JSON.stringify({kind:'click',latitude:e.latlng.lat,longitude:e.latlng.lng}));});` +
    `var routeLine=null;` +
    `function postRoute(km,min){window.ReactNativeWebView.postMessage(JSON.stringify({kind:'route',distanceKm:km,durationMin:min}));}` +
    `function drawRoute(fr,to){` +
    `if(routeLine){map.removeLayer(routeLine);routeLine=null;}` +
    `if(!fr||!to)return;` +
    `var bounds=L.latLngBounds([[fr.latitude,fr.longitude],[to.latitude,to.longitude]]);` +
    `map.fitBounds(bounds,{padding:[36,36]});` +
    `routeLine=L.polyline([[fr.latitude,fr.longitude],[to.latitude,to.longitude]],{color:'#000000',weight:4,dashArray:'8 8'}).addTo(map);` +
    `fetch('https://router.project-osrm.org/route/v1/driving/'+fr.longitude+','+fr.latitude+';'+to.longitude+','+to.latitude+'?overview=full&geometries=geojson')` +
    `.then(function(r){return r.json();}).then(function(j){` +
    `var c=j&&j.routes&&j.routes[0];` +
    `if(!c||!c.geometry||!c.geometry.coordinates)return;` +
    `if(routeLine)map.removeLayer(routeLine);` +
    `routeLine=L.polyline(c.geometry.coordinates.map(function(p){return [p[1],p[0]];}),{color:'#000000',weight:5}).addTo(map);` +
    `map.fitBounds(routeLine.getBounds(),{padding:[36,36]});` +
    `postRoute(c.distance/1000,c.duration/60);` +
    `}).catch(function(){ });}` +
    `window.__updateMap=function(raw){try{var p=JSON.parse(raw);` +
    `if(p.center){var cc=map.getCenter();` +
    `var moved=Math.abs(cc.lat-p.center.latitude)+Math.abs(cc.lng-p.center.longitude);` +
    `if(moved>0.0005)map.setView([p.center.latitude,p.center.longitude],map.getZoom(),{animate:true});}` +
    `if(p.markers)draw(p.markers);` +
    `if('route' in p){var r=p.route;drawRoute(r?r.from:null,r?r.to:null);}` +
    `}catch(e){}};` +
    `(function(){var r=${initialRoute};if(r)drawRoute(r.from,r.to);})();` +
    `</script></body></html>`;
}
