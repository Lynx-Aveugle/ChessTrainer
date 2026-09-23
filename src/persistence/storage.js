import {getAll,put,putMany,remove,replaceAll,migrateLegacy,requestPersistence,estimateStorage} from '../../db.js';

export const loadGames=getAll;
export const saveGame=put;
export const saveGames=putMany;
export const removeGame=remove;
export const replaceGames=replaceAll;
export const migrateStorage=migrateLegacy;
export const keepStoragePersistent=requestPersistence;
export const getStorageEstimate=estimateStorage;

export function loadSettings(key,defaults={}){
  try{const raw=localStorage.getItem(key);return raw?{...defaults,...JSON.parse(raw)}:{...defaults};}catch{return {...defaults};}
}
export function saveSettings(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false;}}
