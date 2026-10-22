(function(){var m=(window.APP_CONFIG||{}).modo==="nuvem"?"nuvem":"local";
    Array.prototype.forEach.call(document.querySelectorAll("[data-modo]"),function(el){el.hidden=el.getAttribute("data-modo")!==m;});})();
  (function(){var c=(window.APP_CONFIG||{}).contato;if(c&&/^[^@\s<>"']+@[^@\s<>"']+$/.test(c)){var el=document.getElementById("contato");el.textContent="";var a=document.createElement("a");a.href="mailto:"+c;a.textContent=c;el.appendChild(a);}})();
