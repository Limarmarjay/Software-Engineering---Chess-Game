const board = document.getElementById("chessboard");

for (let row = 0; row < 8; row++) {

    for (let column = 0; column < 8; column++) {

        const square = document.createElement("div");

        square.classList.add("square");

        if ((row + column) % 2 === 0) {
            square.classList.add("light");
        } else {
            square.classList.add("dark");
        }

        board.appendChild(square);
    }
}