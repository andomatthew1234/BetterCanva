/*
==========================================
 BetterCanva Landing Page
 main.js
==========================================

Features
- Cinematic video mode
- Smooth UI dimming
- Video enlargement
- Scroll reveal animations
- Navbar background on scroll
- Smooth scrolling
- Hover tilt on feature cards
- Optional parallax hero effect

Works with vanilla HTML/CSS only.
*/

document.addEventListener("DOMContentLoaded", () => {

    // ==========================================
    // ELEMENTS
    // ==========================================

    const body = document.body;

    const video = document.getElementById("showcase");
    const videoContainer = document.getElementById("videoContainer");

    const fadeElements = document.querySelectorAll(
        ".fadeable, header, footer, nav"
    );

    const featureCards = document.querySelectorAll(".card");

    const hero = document.querySelector(".hero");

    const navbar = document.querySelector("header");



    // ==========================================
    // CINEMATIC VIDEO MODE
    // ==========================================

    function enableCinematicMode() {

        body.classList.add("cinematic");

        fadeElements.forEach(el => {
            el.classList.add("dimmed");
        });

        if (videoContainer) {
            videoContainer.classList.add("cinematic-focus");
        }

    }

    function disableCinematicMode() {

        body.classList.remove("cinematic");

        fadeElements.forEach(el => {
            el.classList.remove("dimmed");
        });

        if (videoContainer) {
            videoContainer.classList.remove("cinematic-focus");
        }

    }

    if (video) {

        video.addEventListener("play", enableCinematicMode);

        video.addEventListener("pause", disableCinematicMode);

        video.addEventListener("ended", disableCinematicMode);

    }



    // ==========================================
    // SCROLL REVEAL ANIMATIONS
    // ==========================================

    const revealItems = document.querySelectorAll(
        ".card, .hero, .video-wrap, footer"
    );

    const observer = new IntersectionObserver((entries) => {

        entries.forEach(entry => {

            if (entry.isIntersecting) {

                entry.target.classList.add("visible");

            }

        });

    }, {

        threshold: 0.15

    });

    revealItems.forEach(item => {

        item.classList.add("hidden");

        observer.observe(item);

    });



    // ==========================================
    // NAVBAR SCROLL EFFECT
    // ==========================================

    function updateNavbar() {

        if (!navbar) return;

        if (window.scrollY > 40) {

            navbar.classList.add("scrolled");

        } else {

            navbar.classList.remove("scrolled");

        }

    }

    updateNavbar();

    window.addEventListener("scroll", updateNavbar);



    // ==========================================
    // SMOOTH SCROLL LINKS
    // ==========================================

    document.querySelectorAll('a[href^="#"]').forEach(link => {

        link.addEventListener("click", function (e) {

            const target = document.querySelector(this.getAttribute("href"));

            if (!target) return;

            e.preventDefault();

            target.scrollIntoView({

                behavior: "smooth"

            });

        });

    });



    // ==========================================
    // FEATURE CARD TILT EFFECT
    // ==========================================

    featureCards.forEach(card => {

        card.addEventListener("mousemove", e => {

            const rect = card.getBoundingClientRect();

            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const rotateX = ((y / rect.height) - 0.5) * -10;
            const rotateY = ((x / rect.width) - 0.5) * 10;

            card.style.transform =
                `perspective(900px)
                 rotateX(${rotateX}deg)
                 rotateY(${rotateY}deg)
                 translateY(-6px)`;

        });

        card.addEventListener("mouseleave", () => {

            card.style.transform = "";

        });

    });



    // ==========================================
    // HERO PARALLAX
    // ==========================================

    if (hero) {

        window.addEventListener("mousemove", e => {

            const x = (e.clientX / window.innerWidth - 0.5) * 20;
            const y = (e.clientY / window.innerHeight - 0.5) * 20;

            hero.style.transform =
                `translate(${x}px, ${y}px)`;

        });

    }



    // ==========================================
    // VIDEO AUTO SCROLL INTO VIEW
    // ==========================================

    if (video) {

        video.addEventListener("play", () => {

            videoContainer.scrollIntoView({

                behavior: "smooth",
                block: "center"

            });

        });

    }



    // ==========================================
    // ESC KEY EXITS CINEMATIC MODE
    // ==========================================

    document.addEventListener("keydown", e => {

        if (e.key === "Escape") {

            if (!video) return;

            if (!video.paused) {

                video.pause();

            }

            disableCinematicMode();

        }

    });



    // ==========================================
    // OPTIONAL: SPACEBAR TOGGLE VIDEO
    // ==========================================

    document.addEventListener("keydown", e => {

        if (
            e.code !== "Space" ||
            document.activeElement.tagName === "INPUT" ||
            document.activeElement.tagName === "TEXTAREA"
        ) return;

        if (!video) return;

        e.preventDefault();

        if (video.paused) {

            video.play();

        } else {

            video.pause();

        }

    });

});