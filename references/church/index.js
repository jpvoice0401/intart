//툴팁
let currentScene = "";
let hotspotId = "";
const buildingArr = ["DS", "E1", "E2", "GL", "YS", "VS"];

let building = null;
const swiper = swiperInit();
// three.js에서 postMessage 전달
function receiveVRID(threeVRID) {
  // if (event.origin !== 'https://ksmart.myds.me/fgoc2/web/') {
  // if (threeVRID.origin == 'https://ksmart.myds.me') {
  // if (threeVRID.origin == 'https://fgoc-www.kvrcms.com/') {
  // 알려지지 않은 도메인일 경우 무시
  // console.log(threeVRID.origin)
  if (threeVRID.data.vrid) {
    $("#intro").addClass("hide");
    $(".vrPage").removeClass("hide");
    $("#pano").removeClass("hide");
    $(".nav_content").removeClass("open");
    console.log(threeVRID.data.vrid);
    krpano.call(
      `loadscene(${threeVRID.data.vrid},null,MERGE | KEEPVIEW,OPENBLEND(0.5, 0.0, 0.75, 0.05, linear)); lookat(0,0,120,0,0);`
    );
    if (threeVRID.data.vrid.includes("-")) {
      onloadScene(threeVRID.data.vrid.split("-")[0].toUpperCase());
      bd = threeVRID.data.vrid.split("-")[0].toUpperCase();
      $(".nav_content").removeClass("open");
    }

    // three.js 제어
    if ($("#intro").hasClass("hide")) {
      document.getElementById("threeMap").src = "";
    }
  }
}

window.addEventListener("message", receiveVRID);

async function makeSwiper(bdcd) {
  const slideList = await setBuilding(swiper, bdcd);
  await slideList.forEach((slide, index) => {
    if (index == 0) {
      swiper.addSlide(index, slide);
    } else {
      swiper.appendSlide(slide);
    }
  });
  swiper.update();
  swiper.autoplay.resume();

  vrIconInit();
  homeIconInit();
}

// swiper 객체 초기화
function swiperInit() {
  return new Swiper(".myVRSwiper", {
    slidesPerView: 3,
    spaceBetween: 14,
    loop: true,
    clickable: true,
    pagination: {
      el: ".swiper-pagination",
      clickable: true,
    },
    navigation: {
      nextEl: ".swiper-button-next",
      prevEl: ".swiper-button-prev",
    },
    breakpoints: {
      320: {
        slidesPerView: 1.5,
      },
      768: {
        slidesPerView: 3,
      },
    },
    autoplay: {
      delay: 3000,
      disableOnInteraction: false, // 쓸어 넘기거나 버튼 클릭 시 자동 슬라이드 정지.
    },
  });
}

// 슬라이드 HTML 만들기
function makeSlideContents(placeImgUrl, placeNm, placeConts, vrid, urlAttr) {
  let image = placeImgUrl ? `<img src="/file/${placeImgUrl}" alt="" />` : "";
  let title = placeNm ? `<h4 class="zone_title">${placeNm}</h4>` : "";
  let content = placeConts ? `<div class="zone_txt">${placeConts}</div>` : "";
  let vrIcon = vrid
    ? `<span class="icon iconVR" data-vrid="${vrid}">VR</span>`
    : "";
  let link = urlAttr
    ? `<span class="icon iconHome"><a  href="${urlAttr}" target="_blank"><img src="./front/images/ico_home.png" alt="집모양아이콘"/></a></span>`
    : "";
  return `<div class="swiper-slide">
                    ${image}
                    <div class="zone_info">
                      ${title}
                      ${content}
                      <div class="zone_item">
                        ${vrIcon}
                        ${link}
                      </div>
                    </div>
                 `;
}

// 건물 정보 설정
function setBuildingInfo(bdNm, descCont, etc) {
  let leftBox = document.querySelector(".left_box");
  leftBox.querySelector(".tit").innerHTML = bdNm;
  leftBox.querySelector(".txt_box").innerHTML = escapeHtml(descCont);

  // 기타에 VR ID가 있으면 타이틀 vrid 버튼 생성
  if (etc) {
    createVRShortcut(etc);
  }
}
// 바로가기 버튼 추가
function createVRShortcut(etc) {
  // 바로가기 버튼 추가
  const goVR = document.createElement("span");
  leftBox.querySelector(".tit").appendChild(goVR);
  goVR.setAttribute("class", "goVR");
  leftBox.querySelector(".goVR").innerHTML = "바로가기";

  // 바로가기 이미지 추가
  const goVRImg = document.createElement("img");
  goVR.appendChild(goVRImg);
  goVRImg.setAttribute("class", "goVRImg");
  leftBox.querySelector(".goVRImg").src = "./front/images/goVR.png";

  // 바로가기 vrid
  $(".goVR").click(function () {
    console.log(etc);
    $("#intro").addClass("hide");
    $(".vrPage").removeClass("hide");
    $("#pano").removeClass("hide");
    krpano.call(
      `loadscene(${etc},null,MERGE|KEEPVIEW,OPENBLEND(0.5, 0.0, 0.75, 0.05, linear)); lookat(0,0,120,0,0);`
    );
    onloadScene(etc);

    // 바로가기 이동시 포커스
    currentScene = etc.split("-")[0];
    currentBd = etc.split("-")[0];
    $(".nav-item").siblings().removeClass("focus");
    $("." + currentBd).addClass("focus");
    const etcIconImg = $("." + currentBd).find("img");
    etcIconImg.addClass("change");
    const iconImgClass = etcIconImg.attr("class");
    etcIconImg.attr("src", `./front/images/${iconImgClass}.png`);
    // 바로가기 이동시 포커스 끝

    $(".nav_content").removeClass("open");

    // three.js 제어
    if ($("#intro").hasClass("hide")) {
      document.getElementById("threeMap").src = "";
    }
  });
}

// 슬라이드 정보를 가져옴
function setBuilding(swiper, bdCd) {
  const currentURL =
    window.location.hostname === "localhost" ? request.local : request.prod;
  let slideList = [];

  if (swiper.slides.length !== 0) {
    swiper.removeAllSlides();
    console.log("지우기 시작");
  }

  if (!bdCd) {
    bdCd = "DS";
  }

  return new Promise(function (resolve, reject) {
    $.ajax({
      url: currentURL + `/api/info/mainInfo?bdCd=${bdCd}`,
      method: "GET",
      success: function (res) {
        let data = res.data;

        setBuildingInfo(data.bdNm, data.descCont, data.etc);
        // 서버에서 가져온 데이터(res)를 사용하는 로직을 작성합니다.
        var placeList = data.placeList;
        if (placeList) {
          placeList.forEach((place) => {
            var thumbFile;
            var thumbUrl = "";
            if (place.fileList) {
              thumbFile = place.fileList[0];

              if (thumbFile != undefined) {
                thumbUrl = thumbFile.fileFullPath;
              }
            }

            // 컨텐츠 생성
            let slide = makeSlideContents(
              thumbUrl,
              place.placeNm,
              escapeHtml(place.placeConts),
              place.vrid,
              place.urlAttr
            );
            slideList.push(slide);
          });
          resolve(slideList);
        }
      },
      error: function (error) {
        reject(error);
      },
    });
  });

  return slideList;
}

makeSwiper();

function initSwiper() {
  var swiper = new Swiper(".mySwiper", {
    slidesPerView: 2,
    spaceBetween: 5,
    // loop: true,
    clickable: true,
    pagination: {
      el: ".swiper-pagination",
      clickable: true,
    },
    autoplay: {
      delay: 3000,
      disableOnInteraction: false, // 쓸어 넘기거나 버튼 클릭 시 자동 슬라이드 정지.
    },
  });
}

// left_box dataset 변경 감지
const leftBox = document.querySelector(".left_box");

const observer = new MutationObserver(function (mutations) {
  // mutations.forEach(function(mutation) {
  //   console.log(mutation);
  // });
  // console.log(leftBox.dataset.place);
  // let placeCD = leftBox.dataset.place;
  // console.log(`코드 할당 : ${placeCD}`);
  // 감지 종료
  // observer.disconnect();
});

const config = {
  attributes: true,
  childList: true,
  characterData: true,
  // subtree: true  |  |  null,
  // attributeOldValue: true  |  |  null,
  // characterDataOldValue: true  |  |  null,
};

document.querySelector("#threeMap").addEventListener("load", function () {
  setTimeout(() => {
    observer.observe(leftBox, config);

    const buildings = document
      .querySelector("#threeMap")
      .contentWindow.document.querySelectorAll(".building");
    buildings.forEach((building) => {
      building.addEventListener("click", function () {
        setTimeout(() => {
          let placeCD = leftBox.dataset.place;
          console.log(`코드 할당 : ${placeCD}`);
          makeSwiper(placeCD);
          titVrid = placeCD;
          console.log(`변경된 : ${titVrid}`);
        }, 100);
      });
    });
  }, 2000);
});

// 모바일 메뉴 열기/닫기
const navMenu = document.querySelector(".nav");
const navMenuCont = document.querySelector(".nav_content");
const closeMenuBtn = document.querySelector(".close_menu_btn");
const mobileMenuBtn = document.querySelector(".mobile_menu_btn");

function closeMenu() {
  navMenu.style.display = "none";
  navMenuCont.classList.remove("open");
}

function openMenu() {
  navMenu.style.display = "block";
  navMenuCont.classList.add("open");
}

closeMenuBtn.addEventListener("click", closeMenu);
mobileMenuBtn.addEventListener("click", openMenu);

$(".close_dim").click(function () {
  $(".dim").removeClass("show");
});

// 바로가기 vrid
// $(".goVR").click(function () {
//   if(bdNm == 'YS') {
//     console.log(bdNm);
//     $("#intro").addClass("hide");
//     $(".vrPage").removeClass("hide");
//     $("#pano").removeClass("hide");
//     krpano.call(
//         `loadscene(${bdNm}-00-02,null,MERGE|KEEPVIEW,OPENBLEND(0.5, 0.0, 0.75, 0.05, linear)); lookat(0,0,120,0,0);`
//     );
//     onloadScene(bdNm);
//     $('.nav_content').removeClass('open');
//   } else {
//     console.log(bdNm);
//     $("#intro").addClass("hide");
//     $(".vrPage").removeClass("hide");
//     $("#pano").removeClass("hide");
//     krpano.call(
//         `loadscene(${bdNm}-00-01,null,MERGE|KEEPVIEW,OPENBLEND(0.5, 0.0, 0.75, 0.05, linear)); lookat(0,0,120,0,0);`
//     );
//     onloadScene(bdNm);
//     $('.nav_content').removeClass('open');
//   }
// });
