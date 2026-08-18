const cardForm = document.getElementById("card-form");

if (cardForm) {
  cardForm.addEventListener("submit", (event) => {
    event.preventDefault();
    window.alert("This demo card form does not charge. Use Bridge instead.");
  });
}
