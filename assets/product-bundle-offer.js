import { fetchConfig } from '@theme/utilities';
import { ThemeEvents, CartAddEvent } from '@theme/events';

class ProductBundleOffer extends HTMLElement {
  connectedCallback() {
    this.offerType = this.dataset.offerType || 'fixed_bundle';
    this.productId = this.dataset.productId || '';
    this.currencyCode = this.dataset.currencyCode || 'USD';
    this.showCurrencyCode = this.dataset.showCurrencyCode === 'true';
    this.fixedDiscountPercent = Number(this.dataset.fixedDiscountPercent || 0);
    this.includeCurrentProduct = this.dataset.includeCurrentProduct === 'true';
    this.forceVariantAvailability = this.dataset.forceVariantAvailability === 'true';
    this.heading = this.dataset.heading || 'Bundle offer';

    this.status = this.querySelector('[data-offer-status]');
    this.submitButton = this.querySelector('[data-offer-submit]');
    this.fixedPrice = this.querySelector('[data-fixed-price]');
    this.fixedComparePrice = this.querySelector('[data-fixed-compare-price]');
    this.currentItem = this.querySelector('[data-current-item="true"]');
    this.currentItemPrice = this.querySelector('[data-current-item-price]');
    this.currentVariantTitle = this.querySelector('[data-current-variant-title]');
    this.tierInputs = Array.from(this.querySelectorAll('[data-tier-input]'));

    this.currentVariant = {
      id: Number(this.dataset.currentVariantId || 0),
      price: Number(this.dataset.currentVariantPrice || 0),
      available: this.forceVariantAvailability || this.dataset.currentVariantAvailable === 'true',
      compareAtPrice: Number(this.dataset.currentVariantCompareAtPrice || 0),
      title: this.currentVariantTitle?.textContent?.trim() || '',
    };

    this.onVariantUpdate = this.onVariantUpdate.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
    this.onTierChange = this.onTierChange.bind(this);

    document.addEventListener(ThemeEvents.variantUpdate, this.onVariantUpdate);
    this.submitButton?.addEventListener('click', this.onSubmit);
    this.tierInputs.forEach((input) => input.addEventListener('change', this.onTierChange));

    this.updateUI();
  }

  disconnectedCallback() {
    document.removeEventListener(ThemeEvents.variantUpdate, this.onVariantUpdate);
    this.submitButton?.removeEventListener('click', this.onSubmit);
    this.tierInputs.forEach((input) => input.removeEventListener('change', this.onTierChange));
  }

  onVariantUpdate(event) {
    const updatedProductId = String(event.detail?.data?.productId || '');
    if (!updatedProductId || updatedProductId !== this.productId) return;

    const variant = event.detail?.resource;
    if (!variant) return;

    this.currentVariant = {
      id: Number(variant.id || 0),
      price: Number(variant.price || 0),
      available: this.forceVariantAvailability || Boolean(variant.available),
      compareAtPrice: Number(variant.compare_at_price || 0),
      title: variant.title === 'Default Title' ? '' : variant.title || '',
    };

    if (this.currentItem) {
      this.currentItem.dataset.variantId = String(this.currentVariant.id);
      this.currentItem.dataset.price = String(this.currentVariant.price);
      this.currentItem.dataset.available = String(this.currentVariant.available);
    }

    if (this.currentVariantTitle) {
      this.currentVariantTitle.textContent = this.currentVariant.title;
      this.currentVariantTitle.classList.toggle('hidden', !this.currentVariant.title);
    }

    const image = variant.featured_image?.src || variant.featured_media?.preview_image?.src;
    const imageElement = this.currentItem?.querySelector('.product-bundle-offer__item-image');
    if (image && imageElement instanceof HTMLImageElement) {
      imageElement.src = image;
    }

    this.updateUI();
  }

  onTierChange(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    this.tierInputs.forEach((tierInput) => {
      const card = tierInput.closest('[data-tier-card]');
      if (card instanceof HTMLElement) {
        card.toggleAttribute('data-selected', tierInput.checked);
      }
    });

    this.updateVolumePricing();
  }

  updateUI() {
    if (this.offerType === 'fixed_bundle') {
      this.updateFixedBundlePricing();
    } else {
      this.updateVolumePricing();
    }

    this.updateButtonState();
  }

  updateFixedBundlePricing() {
    if (this.currentItemPrice) {
      this.currentItemPrice.textContent = this.formatMoney(this.currentVariant.price);
    }

    const staticItems = this.getFixedBundleItems();
    let regularTotal = staticItems.reduce((total, item) => total + item.price, 0);

    if (this.includeCurrentProduct) {
      regularTotal += this.currentVariant.price;
    }

    const discountedTotal = Math.round(regularTotal * (100 - this.fixedDiscountPercent) / 100);

    if (this.fixedPrice) {
      this.fixedPrice.textContent = this.formatMoney(discountedTotal);
    }

    if (this.fixedComparePrice) {
      this.fixedComparePrice.textContent = this.formatMoney(regularTotal);
      this.fixedComparePrice.classList.toggle('hidden', this.fixedDiscountPercent <= 0);
    }
  }

  updateVolumePricing() {
    this.tierInputs.forEach((input) => {
      const quantity = Number(input.dataset.quantity || 0);
      const discount = Number(input.dataset.discount || 0);
      const comparePrice = this.currentVariant.price * quantity;
      const finalPrice = Math.round(comparePrice * (100 - discount) / 100);
      const card = input.closest('[data-tier-card]');
      const finalPriceElement = card?.querySelector('[data-tier-final-price]');
      const comparePriceElement = card?.querySelector('[data-tier-compare-price]');

      if (finalPriceElement) {
        finalPriceElement.textContent = this.formatMoney(finalPrice);
      }

      if (comparePriceElement) {
        comparePriceElement.textContent = this.formatMoney(comparePrice);
        comparePriceElement.classList.toggle('hidden', discount <= 0);
      }
    });
  }

  updateButtonState() {
    if (!this.submitButton) return;

    const hasFixedItems = this.offerType === 'fixed_bundle' ? this.getFixedBundleItems().length > 0 : true;
    const hasSelectedTier = this.offerType === 'volume_discount' ? Boolean(this.getSelectedTier()) : true;
    const requiresCurrentProduct = this.offerType === 'volume_discount' || this.includeCurrentProduct;
    const currentVariantAvailable = requiresCurrentProduct ? this.currentVariant.available : true;

    this.submitButton.disabled = !currentVariantAvailable || !hasFixedItems || !hasSelectedTier;
  }

  getFixedBundleItems() {
    return Array.from(this.querySelectorAll('[data-bundle-item]'))
      .filter((item) => item instanceof HTMLElement && item.dataset.currentItem !== 'true')
      .map((item) => ({
        variantId: Number(item.dataset.variantId || 0),
        price: Number(item.dataset.price || 0),
        available: item.dataset.available === 'true',
        title: item.dataset.productTitle || '',
      }))
      .filter((item) => item.variantId > 0 && item.available);
  }

  getSelectedTier() {
    return this.tierInputs.find((input) => input.checked) || this.tierInputs[0] || null;
  }

  async onSubmit() {
    if (!this.submitButton || this.submitButton.disabled) return;

    const items = [];
    let offerLabel = this.heading;

    if (this.offerType === 'fixed_bundle') {
      const fixedItems = this.getFixedBundleItems();
      if (this.includeCurrentProduct) {
        items.push({
          id: this.currentVariant.id,
          quantity: 1,
          properties: {
            _bundle_offer: this.heading,
            _bundle_type: 'fixed_bundle',
          },
        });
      }

      fixedItems.forEach((item) => {
        items.push({
          id: item.variantId,
          quantity: 1,
          properties: {
            _bundle_offer: this.heading,
            _bundle_type: 'fixed_bundle',
          },
        });
      });
    } else {
      const selectedTier = this.getSelectedTier();
      if (!selectedTier) return;

      const quantity = Number(selectedTier.dataset.quantity || 1);
      offerLabel = selectedTier.dataset.tierLabel || this.heading;

      items.push({
        id: this.currentVariant.id,
        quantity,
        properties: {
          _bundle_offer: this.heading,
          _bundle_type: 'volume_discount',
          _bundle_tier: offerLabel,
        },
      });
    }

    if (items.length === 0) return;

    this.setLoading(true);
    this.setStatus('');

    try {
      const sections = this.getCartSectionIds();
      const response = await fetch(Theme.routes.cart_add_url, {
        ...fetchConfig('json', {
          body: JSON.stringify({
            items,
            sections: sections.join(','),
            sections_url: window.location.pathname,
          }),
        }),
      });

      const data = await response.json();

      if (data.status) {
        this.setStatus(data.description || data.message || 'Unable to add this offer to cart.', 'error');
        return;
      }

      const cartResponse = await fetch('/cart.js');
      const cart = await cartResponse.json();

      document.dispatchEvent(
        new CartAddEvent(cart, this.id, {
          source: 'bundle-offer',
          itemCount: cart.item_count,
          sections: data.sections,
          productId: this.productId,
        })
      );

      this.setStatus(`${offerLabel} added to cart.`, 'success');
    } catch (error) {
      console.error(error);
      this.setStatus('Something went wrong while adding this offer to cart.', 'error');
    } finally {
      this.setLoading(false);
    }
  }

  getCartSectionIds() {
    const sections = new Set();
    document.querySelectorAll('cart-items-component[data-section-id]').forEach((element) => {
      if (element instanceof HTMLElement && element.dataset.sectionId) {
        sections.add(element.dataset.sectionId);
      }
    });

    return Array.from(sections);
  }

  setLoading(isLoading) {
    if (!this.submitButton) return;

    this.submitButton.dataset.loading = String(isLoading);
    if (isLoading) {
      this.submitButton.disabled = true;
      return;
    }

    this.updateButtonState();
  }

  setStatus(message, state = '') {
    if (!this.status) return;

    this.status.textContent = message;
    if (state) {
      this.status.dataset.state = state;
    } else {
      this.status.removeAttribute('data-state');
    }
  }

  formatMoney(cents) {
    return new Intl.NumberFormat(document.documentElement.lang || undefined, {
      style: 'currency',
      currency: this.currencyCode,
      currencyDisplay: this.showCurrencyCode ? 'code' : 'symbol',
    }).format(cents / 100);
  }
}

if (!customElements.get('product-bundle-offer')) {
  customElements.define('product-bundle-offer', ProductBundleOffer);
}
