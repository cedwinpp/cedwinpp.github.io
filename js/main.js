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

// --- LÓGICA DEFINITIVA PARA EL FILTRO DE LIBROS ---
if (document.querySelector('.filter-buttons')) {
    const filterButtons = document.querySelectorAll('.filter-btn');
    // Seleccionamos las SECCIONES que vamos a ocultar/mostrar
    const bookSections = document.querySelectorAll('.book-section');

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            const filter = button.getAttribute('data-filter');

            // Actualiza cuál botón se ve activo
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Oculta o muestra las SECCIONES completas
            bookSections.forEach(section => {
                // Si el filtro es "todos" O la sección tiene la clase del filtro...
                if (filter === 'todos' || section.classList.contains(filter)) {
                    section.classList.remove('hidden'); // ...la mostramos.
                } else {
                    section.classList.add('hidden'); // ...si no, la ocultamos.
                }
            });
        });
    });
}
