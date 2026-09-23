export function createRouter({onNavigate}={}){
  let current=null;
  return {
    get current(){return current;},
    navigate(id){current=id;return onNavigate?.(id);}
  };
}
