function clock() {
    const clock = document.getElementById("clock")
    const now = new Date();
    let hour = now.getHours();
    let minute = now.getMinutes();
    let second = now.getSeconds();

    hour = hour < 10 ? "0" + hour : hour;
    minute = minute < 10 ? "0" + minute : minute;
    second = second < 10 ? "0" + second : second;
    clock.innerHTML = `${hour} : ${minute} : ${second}`
}
setInterval(clock,950);
clock();

function getRandomColor() {
    const letters = "012345678910ABCDEF";
    let color = "#"
    for(let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random()*16)]
    }
    return color
}
document.getElementById("change-color").addEventListener("click", function() {
    const newColor = getRandomColor();
    document.getElementById("color-box").style.backgroundColor = newColor
    document.getElementById("color-code").innerHTML = newColor;
})