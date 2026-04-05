import { Component } from '@theme/component';
import { ThemeEvents, VariantUpdateEvent, ZoomMediaSelectedEvent } from '@theme/events';
import { prefersReducedMotion } from '@theme/utilities';

/**
 * A custom element that renders a media gallery.
 *
 * @typedef {object} Refs
 * @property {import('./zoom-dialog').ZoomDialog} [zoomDialogComponent] - The zoom dialog component.
 * @property {import('./slideshow').Slideshow} [slideshow] - The slideshow component.
 * @property {HTMLElement[]} [media] - The media elements.
 *
 * @extends Component<Refs>
 */
export class MediaGallery extends Component {
  #variantSelectionToken = 0;

  connectedCallback() {
    super.connectedCallback();

    const { signal } = this.#controller;
    const target = this.closest('.shopify-section, dialog');

    target?.addEventListener(ThemeEvents.variantUpdate, this.#handleVariantUpdate, { signal });
    this.refs.zoomDialogComponent?.addEventListener(ThemeEvents.zoomMediaSelected, this.#handleZoomMediaSelected, {
      signal,
    });
  }

  #controller = new AbortController();

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#controller.abort();
  }

  /**
   * Handles a variant update event by replacing the current media gallery with a new one.
   *
   * @param {VariantUpdateEvent} event - The variant update event.
   */
  #handleVariantUpdate = (event) => {
    const source = event.detail.data.html;
    const previousCurrentIndex = this.slideshow?.current ?? 0;

    if (!source) return;
    const newMediaGallery = source.querySelector('media-gallery');
    const featuredMediaId = event.detail.resource?.featured_media?.id;
    const selectionToken = ++this.#variantSelectionToken;

    if (!newMediaGallery) return;

    this.replaceWith(newMediaGallery);

    if (!featuredMediaId) return;

    const selectFeaturedMedia = (attempt = 0) => {
      const slideshow = newMediaGallery.querySelector('slideshow-component');
      const scroller = newMediaGallery.querySelector('slideshow-slides');
      const slides = Array.from(newMediaGallery.querySelectorAll('slideshow-slide'));
      const targetSlide = slides.find((slide) => slide.getAttribute('slide-id') === `${featuredMediaId}`);

      if (!slideshow || !scroller || slides.length === 0 || !targetSlide) {
        if (attempt < 10) {
          window.setTimeout(() => selectFeaturedMedia(attempt + 1), 50);
        }
        return;
      }

      const targetIndex = slides.indexOf(targetSlide);

      if (targetIndex >= 0) {
        const startIndex = Math.min(previousCurrentIndex, slides.length - 1);
        this.#animateToSlide({
          token: selectionToken,
          slideshow,
          scroller,
          slides,
          startIndex,
          targetIndex,
        });
      }
    };

    requestAnimationFrame(() => selectFeaturedMedia());
  };

  #syncSlideState(slideshow, slides, index) {
    slideshow.setAttribute('initial-slide', `${index}`);

    slides.forEach((slide, slideIndex) => {
      slide.setAttribute('aria-hidden', `${slideIndex !== index}`);
    });

    if ('current' in slideshow) {
      slideshow.current = index;
    }
  }

  #animateToSlide({ token, slideshow, scroller, slides, startIndex, targetIndex }) {
    if (token !== this.#variantSelectionToken) return;

    const reducedMotion = prefersReducedMotion();
    const initialSlide = slides[startIndex];
    const targetSlide = slides[targetIndex];

    if (!initialSlide || !targetSlide) return;

    // Start from the currently visible slide, then perform one continuous scroll to the target slide.
    this.#syncSlideState(slideshow, slides, startIndex);
    scroller.scrollTo({
      left: initialSlide.offsetLeft,
      behavior: 'instant',
    });

    const moveToTarget = () => {
      if (token !== this.#variantSelectionToken) return;
      this.#syncSlideState(slideshow, slides, targetIndex);
      scroller.scrollTo({
        left: targetSlide.offsetLeft,
        behavior: reducedMotion ? 'instant' : 'smooth',
      });
    };

    if (startIndex === targetIndex || reducedMotion) {
      moveToTarget();
      return;
    }

    requestAnimationFrame(moveToTarget);
  }

  /**
   * Handles the 'zoom-media:selected' event.
   * @param {ZoomMediaSelectedEvent} event - The zoom-media:selected event.
   */
  #handleZoomMediaSelected = async (event) => {
    this.slideshow?.select(event.detail.index, undefined, { animate: false });
  };

  /**
   * Zooms the media gallery.
   *
   * @param {number} index - The index of the media to zoom.
   * @param {PointerEvent} event - The pointer event.
   */
  zoom(index, event) {
    this.refs.zoomDialogComponent?.open(index, event);
  }

  get slideshow() {
    return this.refs.slideshow;
  }

  get media() {
    return this.refs.media;
  }

  get presentation() {
    return this.dataset.presentation;
  }
}

if (!customElements.get('media-gallery')) {
  customElements.define('media-gallery', MediaGallery);
}
