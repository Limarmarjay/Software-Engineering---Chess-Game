const board = document.getElementById("chessboard");

for (let row = 0; row < 8; row++) {

    for (let column = 0; column < 8; column++) {

        const square = document.createElement("div");

        square.classList.add("square");

        //abi added this
        square.dataset.row = row;
        square.dataset.column = column;
        //abi added this

        if ((row + column) % 2 === 0) {
            square.classList.add("light");
        } else {
            square.classList.add("dark");
        }

        board.appendChild(square);
    }
}

const squares = document.querySelectorAll(".square");

function getSquare(row, column) {
    return squares[row * 8 + column];
}

// Black pawns
for (let column = 0; column < 8; column++) {
    getSquare(1, column).textContent = "♟";
}

// White pawns
for (let column = 0; column < 8; column++) {
    getSquare(6, column).textContent = "♙";
}

// Black Rooks
getSquare(0, 0).textContent = "♜";
getSquare(0, 7).textContent = "♜";

// White Rooks
getSquare(7, 0).textContent = "♖";
getSquare(7, 7).textContent = "♖";

// Black Knights
getSquare(0, 1).textContent = "♞";
getSquare(0, 6).textContent = "♞";

// White Knights
getSquare(7, 1).textContent = "♘";
getSquare(7, 6).textContent = "♘";

// Black Bishops
getSquare(0, 2).textContent = "♝";
getSquare(0, 5).textContent = "♝";

// White Bishops
getSquare(7, 2).textContent = "♗";
getSquare(7, 5).textContent = "♗";

// Black Queen
getSquare(0, 3).textContent = "♛";

// White Queen
getSquare(7, 3).textContent = "♕";

// Black King
getSquare(0, 4).textContent = "♚";

// White King
getSquare(7, 4).textContent = "♔"; 