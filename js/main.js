// Animación de Scroll para revelar elementos
function reveal() {
    var reveals = document.querySelectorAll(".reveal");

    for (var i = 0; i < reveals.length; i++) {
        var windowHeight = window.innerHeight;
        var elementTop = reveals[i].getBoundingClientRect().top;
        var elementVisible = 150; // Distancia para que el elemento sea visible

        if (elementTop < windowHeight - elementVisible) {
            reveals[i].classList.add("active");
        } else {
            reveals[i].classList.remove("active");
        }
    }
}

window.addEventListener("scroll", reveal);
reveal();


// CÓDIGO AÑADIDO: Activa la librería de zoom (baguetteBox)
window.addEventListener('load', function() {
  // Buscamos si existe al menos un elemento con la clase .gallery en la página
  if(document.querySelector('.gallery')){
    // Si existe, activamos la librería en todos los elementos con esa clase
    baguetteBox.run('.gallery');
  }
});
