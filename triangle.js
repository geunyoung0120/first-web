function calcuateOnClickHandler() {
    const vase = parseFloat(document.getElementById("base").value);
    const height = parseFloat(document.getElementById("height").value);
    if(isNaN(base) || isNaN(height) || base<=0 || height<=0) {
        alert("밑변과 높이를 제대로 입력해주세요")
        return;
    }
    const result = (base * height) / 2;
    document.getElementById("result").innerHTML = `<b>삼각형의 넓이는 ${result}입니다</b>`
}
document.getElementById("calculate").addEventListener("click",calcuateOnClickHandler)