var prevScrollpos = window.pageYOffset;
window.onscroll = function() {
  var currentScrollPos = window.pageYOffset;
  if (prevScrollpos > currentScrollPos) {
    document.getElementsByClassName("header")[0].style.top = "0";
  } else {
    document.getElementsByClassName("header")[0].style.top = "-100px";
  }
      prevScrollpos = currentScrollPos;
}