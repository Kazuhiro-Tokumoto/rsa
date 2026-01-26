export function createHeader(text, author, showHome) {
    const headerContainer = document.createElement('div');
    // className="flex flex-row border-b-[1px] w-full justify-center items-center mb-[2dvh]"
    headerContainer.style.cssText = `
    display: flex;
    flex-direction: row;
    border-bottom: 1px solid currentColor;
    width: 100%;
    justify-content: center;
    align-items: center;
    margin-bottom: 2dvh;
  `;
    if (showHome) {
        const homeLink = document.createElement('p');
        homeLink.textContent = 'ホームへ';
        // className="text-xl mb-[1dvh] justify-center items-center flex mr-[5dvh] cursor-pointer"
        homeLink.style.cssText = `
      font-size: 1.25rem;
      margin: 0;
      margin-bottom: 1dvh;
      margin-right: 5dvh;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
    `;
        homeLink.onclick = () => {
            window.location.href = 'https://tools.shudo-physics.com/';
        };
        headerContainer.appendChild(homeLink);
    }
    const title = document.createElement('p');
    title.textContent = text;
    // className="text-3xl mb-[1dvh]"
    title.style.cssText = `
    font-size: 1.875rem;
    margin: 0;
    margin-bottom: 1dvh;
  `;
    headerContainer.appendChild(title);
    return headerContainer;
}
