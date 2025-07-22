// Animación de Scroll para revelar elementos
function reveal() {
    var reveals = document.querySelectorAll(".reveal");

    for (var i = 0; i < reveals.length; i++) {
        var windowHeight = window.innerHeight;
        var elementTop = reveals[i].getBoundingClientRect().top;
        var elementVisible = 150;

        if (elementTop < windowHeight - elementVisible) {
            reveals[i].classList.add("active");
        } else {
            reveals[i].classList.remove("active");
        }
    }
}
window.addEventListener("scroll", reveal);
reveal();


// Activa la librería de zoom (baguetteBox)
window.addEventListener('load', function() {
  if(document.querySelector('.gallery')){
    baguetteBox.run('.gallery');
  }
});


// --- LÓGICA AÑADIDA PARA EL FILTRO DE LIBROS ---
// Solo ejecuta este código si encuentra los botones de filtro en la página
if (document.querySelector('.filter-buttons')) {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const bookCards = document.querySelectorAll('.book-card');

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Obtiene la categoría del botón presionado (ej: 'literatura', 'texto', 'todos')
            const filter = button.getAttribute('data-filter');

            // Actualiza el botón activo
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Muestra u oculta las tarjetas de los libros
            bookCards.forEach(card => {
                if (filter === 'todos' || card.classList.contains(filter)) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
        });
    });
}
