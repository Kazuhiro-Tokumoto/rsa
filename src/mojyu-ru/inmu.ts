export function isinmu(isinmu: boolean) {
      if (isinmu) {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = "https://kazuhiro-tokumoto.github.io/rsa/img/yaju.jpg";
    link.type = "image/jpeg";
    document.head.appendChild(link);
    const title = document.createElement("title");
    title.textContent = "イ ン ム 暗 号 化 デ モ";
    document.head.appendChild(title);
  } else {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = "https://kazuhiro-tokumoto.github.io/rsa/img/rsa_icon.png";
    link.type = "image/png";
    document.head.appendChild(link);
    const title = document.createElement("title");
    title.textContent = "教科書的RSA暗号化デモ";
    document.head.appendChild(title);
  }
}