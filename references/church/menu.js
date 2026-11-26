$(document).ready(function () {
    // 모바일 메뉴 열기/닫기
    const navMenu = document.querySelector('.nav');
    const navMenuCont = document.querySelector('.nav_content');
    const closeMenuBtn = document.querySelector('.close_menu_btn');
    const mobileMenuBtn = document.querySelector('.mobile_menu_btn');

    function closeMenu() {
      navMenu.style.display = 'none';
      navMenuCont.classList.remove('open');
    }

    function openMenu() {
      navMenu.style.display = 'block';
      navMenuCont.classList.add('open');
    }

    closeMenuBtn.addEventListener('click', closeMenu);
    mobileMenuBtn.addEventListener('click', openMenu);
})

// 대 메뉴 눌렀을 때 나오는 층 별 목록
let bdFloorInfoMap = {};

// 네비게이션 버튼 클릭
function naviButton(
    bdCd,
    allOpen = false,
    isSearch = false,
    searchPlaceNm = "",
    importantVr = ""
) {
    const currentURL =
        window.location.hostname === "localhost" ? request.local : request.prod;
    $("." + bdCd + "-cont").addClass("show");
    $("." + bdCd + "-cont")
        .siblings()
        .removeClass("show");
    let bdCdUl = document.getElementById(bdCd);
    if (!bdFloorInfoMap[bdCd]) {

        $.ajax({
            url:
                currentURL +
                `/api/info/menuInfo?bdCd=${bdCd}&searchPlaceNm=${searchPlaceNm}&importantVr=${importantVr}`,
            type: "GET",
            contentType: "application/x-www-form-urlencoded; charset=UTF-8",
            dataType: "json",
            data: param,
            success: function (result) {
                $("input[name=bdCd]").val(bdCd);
                // $(".showPopup").remove();
                let html = "";

                if (result.data.bdList.length > 0) {
                    // 층 메뉴 목록
                    bdFloorInfoMap[bdCd] = result.data.bdList[0].floorList;
                    let nowCount = 0;
                    for (let floor of bdFloorInfoMap[bdCd]) {
                        addFloorLi(allOpen, floor, bdCd, nowCount);
                        nowCount++;
                    }
                }
            },
        });
    }
}

function toggleMenu(e) {
    $(".cont_wrap > div > div > ul > li > ul > li").each(function (idx, item) {
        $(item).removeClass("active");
    });
    $(e.currentTarget).parent().find("li").find("a:eq(0)").css("font-weight", "");
    if ($(e.currentTarget).hasClass("active")) {
        $(e.currentTarget).find(" > ul").slideUp(300);
        $(e.currentTarget).removeClass("active");
    } else {
        // 전체 닫기
        $(e.currentTarget).parent().find(" > li").find(" > ul").slideUp(300);
        $(e.currentTarget).parent().find(" > li").removeClass("active");
        $(e.currentTarget).find(" > ul").slideDown(300);
        $(e.currentTarget).addClass("active");
    }
}

function togglePlace(e) {
    $(e.currentTarget).parent().find("li").find("a:eq(0)").css("font-weight", "");
    // 팝업이 있으면
    if (
        $(".showPopup.place_" + e.currentTarget.dataset.bdplaceseq + "").html() &&
        !$(".showPopup.place_" + e.currentTarget.dataset.bdplaceseq + "").hasClass(
            "show"
        )
    ) {
        $(e.currentTarget).find("a:eq(0)").css("font-weight", "bold");
    }
    if ($(e.currentTarget).hasClass("active")) {
        $(e.currentTarget).removeClass("active");
    } else {
        $(e.currentTarget).addClass("active");
    }
}

function addFloorLi(allOpen, floor, bdCd, index) {
    // 층 목록 li
    let floorLi = document.createElement("li");
    let classNameList = ["floorLi"];

    if (allOpen) {
        classNameList.add("active");
    }

    floorLi.classList.add(classNameList);
    floorLi.setAttribute("data-index", index);
    // 층의 A 태그
    let floorLiATag = document.createElement("a");
    floorLiATag.text = floor.floorNm;
    // 층의 span 태그
    let floorLiSpan = document.createElement("span");
    floorLiSpan.className = "arrow";
    floorLi.append(floorLiATag, floorLiSpan);

    const mainUl = document.getElementById(bdCd);

    floorLi.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        //층 클릭 시 팝업 닫히도록
        $("#popupTemp").empty();

        // 층 하위에 있는 장소 목록 ul
        let placeUl = document.createElement("ul");
        placeUl.style.display = allOpen ? "block" : "none";

        let dataIndex = floorLi.getAttribute("data-index");

        makePlace(placeUl, floor.placeList, allOpen, dataIndex);

        if (!floorLi.querySelector("ul")) {
            floorLi.append(placeUl);
        }

        if(e.target.classList.contains("floorLi") || e.target.tagName === 'A') {
            toggleMenu(e);
        }
    });

    // if()
    mainUl.append(floorLi);
}


// 해당 층의 li 만들기
// 해당 층의 li 만들기
function makePlace(placeUl, placeList, allOpen, dataIndex) {
    for (let place of placeList) {
        let isMake =
            place.telNo ||
            place.urlAttr ||
            place.placeConts ||
            place.isHasFile;

        let placeLi = document.createElement("li");
        placeLi.className = "placeLi";
        placeLi.style.cursor = isMake ? "pointer" : "auto";
        placeLi.setAttribute("data-bdplaceseq", place.bdPlaceSeq);
        placeLi.onclick = function(e) {
            let currentTarget = e.currentTarget;
                if (!$(e.target).hasClass("vr_mark")) {
                    // 팝업이 없으면 클릭 안됨
                    if ($(e.currentTarget).css("cursor") !== "auto") {
                        togglePlace(e);
                        togglePopup(e, currentTarget.getAttribute('data-bdplaceseq'))
                        // togglePopup(e);
                    }
                } else {
                    // vr 이동
                    $(".cont_wrap > div > div > ul > li > ul > li").click(function (e) {
                        $(e.target).siblings().removeClass("active");
                    });
                    // 팝업
                    closePopup();
                    //$('.nav_content').removeClass('open');
                }
        };
        if (isMake) {
            let placeLiA = document.createElement("a");
            placeLiA.href = "#";
            placeLiA.style.color = "#0069b4";
            placeLiA.innerText = place.placeNm;
            placeLi.append(placeLiA);
        } else {
            let placeLiSpan = document.createElement("span");
            placeLiSpan.innerText = place.placeNm;
            placeLi.append(placeLiSpan);
        }

        if (place.vrId) {
            let placeLiA = document.createElement("a");
            placeLiA.href = "#";
            placeLiA.className = "vr_mark";
            placeLiA.setAttribute("data-vrid", place.vrId);

            placeLiA.innerText = "VR";

            // placeLiA.onclick = ()=> {loadScene(place.vrId);};
            placeLiA.setAttribute("onclick", `loadScene('${place.vrId}')`);
            placeLi.append(placeLiA);
        }
        placeUl.append(placeLi);
    }
}



let bd = null;
let currentBd = null;

// navigation 메뉴 닫고 아이콘 변경하기
function navMenuClose() {
    $(".nav-item").siblings().removeClass("focus");
    document.querySelector(".nav_content").classList.remove("open");
    navIconChange();
}
function navIconChange() {
    // 클릭한 아이콘 클래스 추가
    const allIconImg = $(".nav-list").find("img");
    allIconImg.removeClass("change");
    // 아이콘 이미지 변경
    const allIconImgClass = allIconImg.attr("class");
    allIconImg.attr("src", `./front/images/${allIconImgClass}.png`);
    setOriginImage();
}
// 층 목록 닫고 하위 메뉴 닫기
function floorListClose() {
    // active 되어있는 층 목록을 active 제거
    document.querySelectorAll(".active").forEach((element) => {
        element.classList.remove("active");
        let ulElements = element.querySelectorAll("ul");
        ulElements.forEach(function (ulElement) {
            ulElement.style.display = "none";
        });
    });
}

function checkBuilding(building, isPopupClick) {
    if (isPopupClick) {
        return;
    }

    $(".nav-item").siblings().removeClass("focus");

    // 클릭한 아이콘 클래스 추가
    const allIconImg = $(".nav-list").find("img");
    allIconImg.removeClass("change");

    // 아이콘 이미지 변경
    const allIconImgClass = allIconImg.attr("class");
    allIconImg.attr("src", `./front/images/${allIconImgClass}.png`);

    setOriginImage();

    if (building) {
        $("." + building).addClass("focus");
        // 클릭한 아이콘 클래스 추가
        const iconImg = $("." + building).find("img");
        iconImg.addClass("change");
        // 아이콘 이미지 변경
        const iconImgClass = iconImg.attr("class");
        iconImg.attr("src", `./front/images/${iconImgClass}.png`);

        bd = building;
        naviButton(building);
    }
}

function toggleVr() {
    // VR 관람 클릭시 모든 팝업 닫기.
    closePopup();

    if ($(".imp_cont").css("display") === "none") {
        openPanel();
        searchMenu("", "Y");

        // 주요 VR 영역 노출
        $(".imp_cont").show();

        $(".search_cont").removeClass("show");
        $(".home_cont").removeClass("show");
        $(".church_cont").removeClass("show");
        $(".ed1_cont").removeClass("show");
        $(".ed2_cont").removeClass("show");
        $(".mission_cont").removeClass("show");
        $(".welfare_cont").removeClass("show");
        $(".vision_cont").removeClass("show");

        // 채팅창 숨김
        $.frameUtils.hidden();
    } else {
        closePanel();
        $(".nav_content").removeClass("open");
        $(".imp_cont").hide();
    }

    sceneIconFocus('Y');
}