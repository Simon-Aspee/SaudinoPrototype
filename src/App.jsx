import React, { useEffect, useMemo, useRef, useState } from "react";

// =============================
// Tienda simple sin backend
// - Público: ve productos, agrega al carrito y hace pedido por WhatsApp / Email
// - Dueño: modo protegido por PIN para crear/editar productos y la configuración
// - Persistencia "global" sin backend: Exportar JSON y subirlo a tu hosting como /catalogo.json
//   (El app intenta leer /catalogo.json al cargar. Si no existe, usa datos locales de ejemplo.)
// =============================

// ---------- Utilidades ----------
const CLP = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" });

function priceFmt(value, currency = "CLP") {
  try {
    if (currency === "CLP") return CLP.format(Number(value || 0));
    return new Intl.NumberFormat("es", { style: "currency", currency }).format(Number(value || 0));
  } catch {
    return `$${Number(value || 0).toFixed(0)}`;
  }
}

const digitsOnly = (s = "") => (s || "").toString().replace(/[^0-9]/g, "");

function download(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ---------- Datos por defecto ----------
const SAMPLE_PRODUCTS = [
  {
    id: uid(),
    title: "Polera básica unisex",
    price: 7990,
    description: "Algodón 100% suave. Corta clásica.",
    sizes: ["S", "M", "L", "XL"],
    images: [
      "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=1200&auto=format&fit=crop",
    ],
    available: true,
    tags: ["básicos", "algodón"],
    // colores de ejemplo y disponibilidad por talla
    colors: [
      { id: "red", label: "Rojo", hex: "#ef4444" },
      { id: "blue", label: "Azul", hex: "#3b82f6" },
      { id: "black", label: "Negro", hex: "#111827" },
    ],
    // sizeColors: talla -> array de color ids disponibles
    sizeColors: { S: ["red", "black"], M: ["black"], L: ["red", "blue"], XL: ["black"] },
  },
  {
    id: uid(),
    title: "Polerón oversize",
    price: 18990,
    description: "Grueso, ideal para invierno.",
    sizes: ["M", "L", "XL"],
    images: [
      "https://images.unsplash.com/photo-1548883354-7622d03aca29?q=80&w=1200&auto=format&fit=crop",
    ],
    available: true,
    tags: ["invierno"],
    colors: [
      { id: "gray", label: "Gris", hex: "#6b7280" },
      { id: "green", label: "Verde", hex: "#10b981" },
    ],
    sizeColors: { M: ["gray"], L: ["gray", "green"], XL: ["gray"] },
  },
  {
    id: uid(),
    title: "Jeans straight fit",
    price: 24990,
    description: "Tiro medio, calce recto.",
    sizes: ["36", "38", "40", "42"],
    images: [
      "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?q=80&w=1200&auto=format&fit=crop",
    ],
    available: true,
    tags: ["jeans"],
  },
];

const DEFAULT_SETTINGS = {
  storeName: "Mi Tienda",
  currency: "CLP",
  whatsapp: "", // Ej: +56 9 1234 5678
  email: "",
  ownerPIN: "1234", // Solo para bloquear la UI (no es seguridad real)
};

// Paleta fija de colores que el dueño puede seleccionar desde la UI (editar aquí en código)
const DEFAULT_COLOR_PALETTE = [
  { id: "black", label: "Negro", hex: "#111827" },
  { id: "white", label: "Blanco", hex: "#ffffff" },
  { id: "red berry", label: "Red Berry", hex: "#910303" },
];

// ---------- Storage helpers ----------
const LS_KEYS = {
  catalog: "tsb_catalog",
  settings: "tsb_settings",
  cart: "tsb_cart",
  shipping: "tsb_shipping",
};

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { }
}

// ---------- Componentes ----------


function Header({ storeName, onAdminToggle, adminActive, onOpenCart, cartCount }) {
  return (
    <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">{storeName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1.5 rounded-lg border text-sm ${adminActive ? "bg-black text-white" : "bg-white hover:bg-gray-50"}`}
            onClick={onAdminToggle}
            title="Modo dueño"
          >
            {adminActive ? "Dueño: ON" : ""}
          </button>
          <button
            className="px-3 py-1.5 rounded-lg border text-sm bg-white hover:bg-gray-50"
            onClick={onOpenCart}
            title="Carrito"
          >
            Carrito {cartCount ? `(${cartCount})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductCard({ product, onAdd }) {
  const [size, setSize] = useState(product.sizes?.[0] || "");
  const [qty, setQty] = useState(1);
  const [imgOpen, setImgOpen] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState(null);
  const [showColors, setShowColors] = useState(false);
  const colorsRef = useRef(null);

  // keep selectedColor in sync with selected size and available colors for that size
  useEffect(() => {
    if (!product.colors?.length) { setSelectedColor(null); return; }
    const availableIds = (product.sizeColors && product.sizeColors[size]) ? product.sizeColors[size] : product.colors.map(c => c.id);
    setSelectedColor((prev) => (prev && availableIds.includes(prev) ? prev : (availableIds[0] || null)));
  }, [size, product.colors, product.sizeColors]);

  // close dropdown on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (!colorsRef.current) return;
      if (!colorsRef.current.contains(e.target)) setShowColors(false);
    }
    if (showColors) document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [showColors]);

  const images = product.images || (product.imageUrl ? [product.imageUrl] : []);

  return (
    <div className="border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition bg-white">
      <div className="aspect-[4/3] bg-gray-100">
        {images?.length ? (
          <>
            <img
              src={images[0]}
              alt={product.title}
              className="w-full h-full object-cover cursor-zoom-in"
              onClick={() => { setImgIndex(0); setImgOpen(true); }}
            />
            {imgOpen ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/70" onClick={() => setImgOpen(false)} />
                <div className="relative max-w-4xl w-full max-h-[90vh] flex items-center">
                  <button className="absolute left-2 z-50 p-2 rounded-full bg-white/20 text-white" onClick={() => setImgIndex((i) => (i - 1 + images.length) % images.length)}>◀</button>
                  <div className="mx-auto w-full max-w-3xl">
                    <img src={images[imgIndex]} alt={`preview ${imgIndex + 1}`} className="w-full h-full object-contain rounded-lg" />
                    <div className="text-xs text-white text-center mt-2">{imgIndex + 1} / {images.length}</div>
                  </div>
                  <button className="absolute right-2 z-50 p-2 rounded-full bg-white/20 text-white" onClick={() => setImgIndex((i) => (i + 1) % images.length)}>▶</button>
                  <button className="absolute top-2 right-2 px-3 py-1 rounded-lg bg-white/20 text-white" onClick={() => setImgOpen(false)}>Cerrar</button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">Sin imagen</div>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight">{product.title}</h3>
          <div className="font-bold whitespace-nowrap">{priceFmt(product.price)}</div>
        </div>
        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{product.description}</p>

        <div className="flex items-center gap-2 mt-3">
          {product.sizes?.length ? (
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="border rounded-lg px-2 py-1 text-sm"
            >
              {product.sizes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-gray-500">Sin tallas</span>
          )}
          {/* Color selector: show available colors for selected size (or all colors if no mapping) */}
          {product.colors?.length ? (
            <div className="relative" ref={colorsRef}>
              <div className="flex items-center gap-2">
                <div className="text-sm text-gray-600">Color:</div>
                <button
                  type="button"
                  className="p-0.5 rounded-full border w-10 h-10 flex items-center justify-center"
                  onClick={() => setShowColors((s) => !s)}
                  title={(product.colors.find(c => c.id === selectedColor) || {}).label || 'Cambiar color'}
                >
                  <span className="w-6 h-6 rounded-full border" style={{ background: (product.colors.find(c => c.id === selectedColor) || {}).hex }} />
                </button>
              </div>
              {showColors ? (
                <div className="absolute left-0 bottom-full mb-2 w-24 bg-white border rounded-lg shadow-lg p-2 z-20 transform origin-bottom transition-all duration-150 ease-out opacity-100 scale-100">
                  <div className="flex flex-wrap gap-2">
                    {(product.sizeColors && product.sizeColors[size] ? product.sizeColors[size] : product.colors.map(c => c.id)).map((cid) => {
                      const c = product.colors.find(x => x.id === cid);
                      if (!c) return null;
                      const isActive = selectedColor === c.id;
                      return (
                        <button
                          key={c.id}
                          title={c.label}
                          onClick={() => { setSelectedColor(c.id); setShowColors(false); }}
                          className={`w-8 h-8 rounded-full border-2 ${isActive ? 'ring-2 ring-offset-1' : ''}`}
                          style={{ background: c.hex }}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center gap-1">
            <button className="px-2 py-0.5 rounded-lg border text-sm" onClick={() => setQty(Math.max(1, qty - 1))}>-</button>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => {
                const v = e.target.value === "" ? "" : Number(e.target.value || 1);
                setQty(v === "" ? "" : Math.max(1, v));
              }}
              className="w-16 border rounded-lg px-1.5 py-0.5 text-sm text-center"
            />
            <button className="px-2 py-0.5 rounded-lg border text-sm" onClick={() => setQty(Number(qty || 1) + 1)}>+</button>
          </div>
        </div>
        {/* Add button rendered below selectors to avoid layout overlap */}
        <div className="mt-3">
          <button
            className="w-full px-3 py-2 rounded-lg bg-black text-white text-sm hover:opacity-90"
            onClick={() => {
              const p = { ...product, _selectedColorId: selectedColor };
              onAdd(p, size, Number(qty || 1));
            }}
            disabled={!product.available}
          >
            {product.available ? "Agregar" : "No disponible"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CartPanel({ open, onClose, items, onUpdateQty, onRemove, onClear, totals, settings }) {
  if (!open) return null;

  const msg = useMemo(() => {
    const lines = [];
    lines.push(`Pedido para ${settings.storeName}`);
    lines.push("");
    items.forEach((it, i) => {
      const colorText = it.colorLabel ? ` · Color: ${it.colorLabel}` : "";
      lines.push(`${i + 1}. ${it.title} ${it.size ? `(${it.size})` : ""}${colorText} x${it.qty} – ${priceFmt(it.price, settings.currency)}`);
    });
    lines.push("");
    lines.push(`Total: ${priceFmt(totals.total, settings.currency)}`);
    lines.push("");
    lines.push("*POR FAVOR RELLENAR LOS SIGUIENTES DATOS DE ENVÍO*");
    lines.push("");
    lines.push("Nombre:");
    lines.push("Dirección:");
    lines.push("Comuna/Ciudad:");
    lines.push("Teléfono:");
    return lines.join("\n");
  }, [items, totals, settings]);

  const wa = settings.whatsapp ? `https://wa.me/${digitsOnly(settings.whatsapp)}?text=${encodeURIComponent(msg)}` : null;
  const mail = settings.email ? `mailto:${settings.email}?subject=${encodeURIComponent("Pedido " + settings.storeName)}&body=${encodeURIComponent(msg)}` : null;

  return (
    <div className="fixed inset-0 z-30">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Carrito</h2>
          <button className="text-sm text-gray-600 hover:text-black" onClick={onClose}>Cerrar</button>
        </div>
        <div className="p-4 flex-1 overflow-auto">
          {items.length === 0 ? (
            <div className="text-sm text-gray-500">Tu carrito está vacío.</div>
          ) : (
            <div className="space-y-4">
              {items.map((it) => (
                <div key={it.key} className="flex gap-3 border rounded-xl p-3">
                  <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden">
                    {it.imageUrl ? (
                      <img src={it.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{it.title}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">{it.size ? `Talla ${it.size} · ` : ""}{priceFmt(it.price, settings.currency)}{it.colorHex ? (
                      <span className="ml-2 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full border" style={{ background: it.colorHex }} />
                        <span className="text-xs text-gray-600">{it.colorLabel}</span>
                      </span>
                    ) : null}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <button className="px-2 py-1 rounded-lg border" onClick={() => onUpdateQty(it.key, Math.max(1, it.qty - 1))}>-</button>
                      <input
                        type="number"
                        min={1}
                        value={it.qty}
                        onChange={(e) => onUpdateQty(it.key, e.target.value === "" ? "" : Math.max(1, Number(e.target.value || 1)))}
                        className="w-20 border rounded-lg px-2 py-1 text-sm text-center"
                      />
                      <button className="px-2 py-1 rounded-lg border" onClick={() => onUpdateQty(it.key, Number(it.qty || 1) + 1)}>+</button>
                      <button className="ml-auto text-sm text-red-600 hover:underline" onClick={() => onRemove(it.key)}>
                        Quitar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>Subtotal</span>
            <span>{priceFmt(totals.subtotal, settings.currency)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Envío</span>
            <span>{totals.shipping ? priceFmt(totals.shipping, settings.currency) : "A coordinar"}</span>
          </div>
          <div className="flex items-center justify-between font-semibold text-lg">
            <span>Total</span>
            <span>{priceFmt(totals.total, settings.currency)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <a
              href={wa || "#"}
              target="_blank"
              rel="noreferrer"
              className={`text-center px-3 py-2 rounded-lg text-white ${wa ? "bg-green-600 hover:bg-green-700" : "bg-gray-300 cursor-not-allowed"}`}
              onClick={(e) => { if (!wa) e.preventDefault(); }}
            >
              WhatsApp
            </a>
            <a
              href={mail || "#"}
              className={`text-center px-3 py-2 rounded-lg text-white ${mail ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-300 cursor-not-allowed"}`}
              onClick={(e) => { if (!mail) e.preventDefault(); }}
            >
              Email
            </a>
          </div>
          <button className="w-full text-sm text-gray-600 hover:text-black underline" onClick={onClear}>Vaciar carrito</button>
        </div>
      </div>
    </div>
  );
}

function AdminGate({ open, onClose, onUnlock }) {
  const [pin, setPin] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-5">
          <h3 className="font-semibold text-lg">Entrar como dueño</h3>
          <p className="text-sm text-gray-600 mt-1">Ingresa tu PIN para abrir el panel del dueño.</p>
          <input
            autoFocus
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN"
            className="mt-3 w-full border rounded-lg px-3 py-2"
          />
          <div className="mt-4 flex gap-2 justify-end">
            <button className="px-3 py-1.5 rounded-lg border" onClick={onClose}>Cancelar</button>
            <button className="px-3 py-1.5 rounded-lg bg-black text-white" onClick={() => onUnlock(pin)}>Entrar</button>
          </div>
          <p className="text-xs text-gray-500 mt-3">* Esto solo bloquea la interfaz (no es seguridad real).</p>
        </div>
      </div>
    </div>
  );
}

function ImagePicker({ value, onChange }) {
  const fileRef = useRef(null);
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <div className="space-y-2">
      {value ? (
        <>
          <div className="aspect-[4/3] bg-gray-100 rounded-lg overflow-hidden">
            <img
              src={value}
              alt="preview"
              className="w-full h-full object-cover cursor-zoom-in"
              onClick={() => setModalOpen(true)}
            />
          </div>
          {modalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/70" onClick={() => setModalOpen(false)} />
              <div className="relative max-w-4xl w-full max-h-[90vh]">
                <img src={value} alt="preview large" className="w-full h-full object-contain rounded-lg" />
                <button className="absolute top-2 right-2 px-3 py-1 rounded-lg bg-white/20 text-white" onClick={() => setModalOpen(false)}>Cerrar</button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="aspect-[4/3] bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">Sin imagen</div>
      )}
      <div className="flex gap-2">
        <input
          type="url"
          placeholder="Pega URL de imagen (Drive/Dropbox/Imgur, pública)"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => onChange(reader.result?.toString() || "");
            reader.readAsDataURL(f); // guarda como base64 dentro del JSON
          }}
        />
        <button className="px-3 py-2 rounded-lg border text-sm" onClick={() => fileRef.current?.click()}>Subir</button>
      </div>
      <p className="text-xs text-gray-500">Sugerencia: usa URL públicas para mantener el JSON liviano. El modo "Subir" incrusta la imagen en base64 (más pesado).</p>
    </div>
  );
}

function ImagePickerList({ images = [], onChange }) {
  // images: array of url/base64 strings
  const updateAt = (idx, v) => {
    const next = [...images];
    next[idx] = v;
    onChange(next.filter(Boolean));
  };
  const removeAt = (idx) => { onChange(images.filter((_, i) => i !== idx)); };
  const addEmpty = () => { if (images.length < 5) onChange([...images, ""]); };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: Math.max(1, images.length) }).map((_, i) => (
          <div key={i} className="space-y-1">
            <label className="text-xs">Imagen {i + 1}</label>
            <ImagePicker value={images[i]} onChange={(v) => updateAt(i, v)} />
            <div className="flex gap-2">
              <button className="px-2 py-1 text-sm border rounded-lg" onClick={() => removeAt(i)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="px-3 py-2 rounded-lg border text-sm" onClick={addEmpty} disabled={images.length >= 5}>Agregar imagen</button>
        <div className="text-xs text-gray-500">Máx 5 imágenes. Usa URL públicas para mantener el JSON liviano.</div>
      </div>
    </div>
  );
}

function AdminPanel({ catalog, setCatalog, settings, setSettings }) {
  const empty = { id: uid(), title: "", price: 0, description: "", sizes: [], images: [], available: true, tags: [] };
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState("productos");

  function upsertProduct(p) {
    setCatalog((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      const next = [...prev];
      if (idx >= 0) next[idx] = p; else next.unshift(p);
      saveLS(LS_KEYS.catalog, next);
      return next;
    });
  }

  function deleteProduct(id) {
    setCatalog((prev) => {
      const next = prev.filter((x) => x.id !== id);
      saveLS(LS_KEYS.catalog, next);
      return next;
    });
  }

  function move(id, dir) {
    setCatalog((prev) => {
      const idx = prev.findIndex((x) => x.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swapIdx = dir === "up" ? Math.max(0, idx - 1) : Math.min(prev.length - 1, idx + 1);
      const tmp = next[idx];
      next[idx] = next[swapIdx];
      next[swapIdx] = tmp;
      saveLS(LS_KEYS.catalog, next);
      return next;
    });
  }

  function exportJSON() {
    const payload = { settings, products: catalog };
    download("catalogo.json", JSON.stringify(payload, null, 2));
  }

  function importJSON(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result?.toString() || "{}");
        if (Array.isArray(data)) {
          // compat: si suben solo el array de productos
          setCatalog(data);
          saveLS(LS_KEYS.catalog, data);
        } else {
          if (data.settings) {
            setSettings({ ...settings, ...data.settings });
            saveLS(LS_KEYS.settings, { ...settings, ...data.settings });
          }
          if (Array.isArray(data.products)) {
            setCatalog(data.products);
            saveLS(LS_KEYS.catalog, data.products);
          }
        }
        alert("Importado OK. Recuerda Exportar para publicar en tu hosting.");
      } catch (e) {
        alert("Archivo inválido");
      }
    };
    r.readAsText(file);
  }

  // ---- NUEVO: publicar cambios a la Function de Netlify ----
  async function publicarCambios() {
    const pass = prompt("Contraseña de publicación (PUBLISH_PASSWORD):");
    if (!pass) return;

    try {
      const res = await fetch("/.netlify/functions/publish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${pass}`,
        },
        body: JSON.stringify({
          settings,
          products: catalog,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error publicando");

      alert("✅ Cambios publicados. Netlify hará deploy en breve.");
    } catch (err) {
      console.error(err);
      alert("❌ " + err.message);
    }
  }
  // ----------------------------------------------------------

  return (
    <div className="border rounded-2xl p-4 bg-white">
      <div className="flex items-center gap-2 border-b pb-2">
        <button className={`px-3 py-1.5 rounded-lg text-sm ${tab === "productos" ? "bg-black text-white" : "border"}`} onClick={() => setTab("productos")}>Productos</button>
        <button className={`px-3 py-1.5 rounded-lg text-sm ${tab === "config" ? "bg-black text-white" : "border"}`} onClick={() => setTab("config")}>Configuración</button>
        <div className="ml-auto flex items-center gap-2">
          {/* NUEVO botón Publicar */}
          <button
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm"
            onClick={publicarCambios}
            title="Publicar cambios en GitHub (desencadena deploy)"
          >
            Publicar
          </button>

          <button className="px-3 py-1.5 rounded-lg border text-sm" onClick={exportJSON}>Exportar JSON</button>
          <label className="px-3 py-1.5 rounded-lg border text-sm cursor-pointer">
            Importar JSON
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])} />
          </label>
        </div>
      </div>

      {tab === "config" ? (
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nombre de la tienda</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={settings.storeName}
              onChange={(e) => { const v = { ...settings, storeName: e.target.value }; setSettings(v); saveLS(LS_KEYS.settings, v); }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Moneda</label>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={settings.currency}
              onChange={(e) => { const v = { ...settings, currency: e.target.value }; setSettings(v); saveLS(LS_KEYS.settings, v); }}
            >
              <option value="CLP">CLP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">WhatsApp del negocio</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder="+56 9 1234 5678"
              value={settings.whatsapp}
              onChange={(e) => { const v = { ...settings, whatsapp: e.target.value }; setSettings(v); saveLS(LS_KEYS.settings, v); }}
            />
            <p className="text-xs text-gray-500">Se usará para el botón "WhatsApp" del pedido.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Email del negocio</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              placeholder="tutienda@correo.com"
              value={settings.email}
              onChange={(e) => { const v = { ...settings, email: e.target.value }; setSettings(v); saveLS(LS_KEYS.settings, v); }}
            />
            <p className="text-xs text-gray-500">Se usará para el botón "Email" del pedido.</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">PIN del dueño</label>
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2"
              value={settings.ownerPIN}
              onChange={(e) => { const v = { ...settings, ownerPIN: e.target.value }; setSettings(v); saveLS(LS_KEYS.settings, v); }}
            />
            <p className="text-xs text-gray-500">Solo oculta el panel del dueño. No es seguridad real.</p>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <div className="border rounded-2xl p-4">
              <h4 className="font-semibold">{editing ? "Editar" : "Nuevo producto"}</h4>
              <ProductForm
                key={editing?.id || "new"}
                initial={editing || empty}
                onSave={(p) => { upsertProduct(p); setEditing(null); }}
                onCancel={() => setEditing(null)}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {catalog.map((p, idx) => (
                <div key={p.id} className="border rounded-2xl overflow-hidden">
                  <div className="aspect-[4/3] bg-gray-100">
                    {(p.images?.[0] || p.imageUrl) ? <img src={p.images?.[0] || p.imageUrl} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium leading-tight">{p.title}</div>
                        <div className="text-xs text-gray-500">{priceFmt(p.price)}</div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${p.available ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-600"}`}>{p.available ? "Activo" : "Pausado"}</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1 line-clamp-2">{p.description}</div>
                    <div className="text-xs text-gray-500 mt-1">Tallas: {p.sizes?.join(", ") || "-"}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <button className="px-3 py-1.5 rounded-lg border text-sm" onClick={() => move(p.id, "up")}>↑</button>
                      <button className="px-3 py-1.5 rounded-lg border text-sm" onClick={() => move(p.id, "down")}>↓</button>
                      <button className="ml-auto px-3 py-1.5 rounded-lg border text-sm" onClick={() => setEditing(p)}>Editar</button>
                      <button className="px-3 py-1.5 rounded-lg border text-sm text-red-600" onClick={() => deleteProduct(p.id)}>Eliminar</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function ProductForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [sizesText, setSizesText] = useState((initial.sizes || []).join(","));
  // selected palette color ids for this product
  const [selectedPalette, setSelectedPalette] = useState(() => (initial.colors || []).map(c => c.id));
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm font-medium">Título</label>
        <input className="w-full border rounded-lg px-3 py-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Precio</label>
        <input type="number" className="w-full border rounded-lg px-3 py-2" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value || 0) })} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Descripción</label>
        <textarea className="w-full border rounded-lg px-3 py-2" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Tallas (separadas por coma)</label>
        <input
          className="w-full border rounded-lg px-3 py-2"
          placeholder="S,M,L,XL / 36,38,40"
          value={sizesText}
          onChange={(e) => setSizesText(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Colores (elige desde paleta definida en el código)</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {DEFAULT_COLOR_PALETTE.map((c) => {
            const checked = selectedPalette.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedPalette((prev) => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id]);
                }}
                className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${checked ? 'ring-2' : ''}`}
                title={c.label}
              >
                <span className="w-5 h-5 rounded-full border" style={{ background: c.hex }} />
                <span className="text-sm">{c.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">Los colores disponibles para el producto se seleccionan desde esta paleta (editar paleta en el código si hace falta).</p>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Disponibilidad por talla</label>
        <div className="text-xs text-gray-600">Selecciona los ids de color (separados por coma) válidos para cada talla</div>
        <div className="mt-2 space-y-2">
          {(sizesText.split(",").map(s => s.trim()).filter(Boolean)).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-16 text-sm">{s}</div>
              <div className="flex flex-wrap gap-2">
                {selectedPalette.length === 0 ? (
                  <div className="text-xs text-gray-500">No hay colores seleccionados para el producto</div>
                ) : selectedPalette.map((cid) => {
                  const c = DEFAULT_COLOR_PALETTE.find(p => p.id === cid);
                  const checked = (form.sizeColors && form.sizeColors[s] || []).includes(cid);
                  return (
                    <label key={cid} className="flex items-center gap-2 px-2 py-1 border rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setForm(prev => {
                            const sc = { ...(prev.sizeColors || {}) };
                            sc[s] = sc[s] || [];
                            if (e.target.checked) {
                              if (!sc[s].includes(cid)) sc[s].push(cid);
                            } else {
                              sc[s] = sc[s].filter(x => x !== cid);
                            }
                            return { ...prev, sizeColors: sc };
                          });
                        }}
                      />
                      <span className="w-4 h-4 rounded-full border" style={{ background: c?.hex }} />
                      <span className="text-xs">{c?.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Tags (opcional, separadas por coma)</label>
        <input
          className="w-full border rounded-lg px-3 py-2"
          placeholder="básicos, invierno, jeans"
          value={form.tags?.join(",") || ""}
          onChange={(e) => setForm({ ...form, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
        />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium">Imágenes</label>
        <ImagePickerList images={form.images || []} onChange={(imgs) => setForm({ ...form, images: imgs })} />
      </div>
      <div className="flex items-center justify-between mt-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!form.available} onChange={(e) => setForm({ ...form, available: e.target.checked })} />
          Activo (visible)
        </label>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded-lg border text-sm" onClick={onCancel}>Cancelar</button>
          <button
            className="px-3 py-1.5 rounded-lg bg-black text-white text-sm"
            onClick={() => {
              // parse sizes
              const sizes = sizesText.split(",").map((s) => s.trim()).filter(Boolean);
              // build colors array from selectedPalette
              const colors = selectedPalette.map(id => DEFAULT_COLOR_PALETTE.find(c => c.id === id)).filter(Boolean);
              const sizeColors = form.sizeColors || {};
              onSave({ ...form, id: form.id || uid(), sizes, images: (form.images || []).slice(0, 5), colors, sizeColors });
            }}
            disabled={!form.title || !form.price}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [settings, setSettings] = useState(() => loadLS(LS_KEYS.settings, DEFAULT_SETTINGS));
  const [catalog, setCatalog] = useState(() => loadLS(LS_KEYS.catalog, SAMPLE_PRODUCTS));
  const [cart, setCart] = useState(() => loadLS(LS_KEYS.cart, []));
  const [toast, setToast] = useState(null);

  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");

  // Intentar leer /catalogo.json del hosting al cargar (si existe)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/catalogo.json", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setCatalog(data);
            saveLS(LS_KEYS.catalog, data);
          } else {
            if (Array.isArray(data.products)) {
              setCatalog(data.products);
              saveLS(LS_KEYS.catalog, data.products);
            }
            if (data.settings) {
              const v = { ...settings, ...data.settings };
              setSettings(v);
              saveLS(LS_KEYS.settings, v);
            }
          }
        }
      } catch { }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistir carrito
  useEffect(() => { saveLS(LS_KEYS.cart, cart); }, [cart]);

  const filtered = useMemo(() => {
    let list = [...catalog].filter((p) => p.available);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    if (tag) {
      list = list.filter((p) => (p.tags || []).includes(tag));
    }
    return list;
  }, [catalog, query, tag]);

  const allTags = useMemo(() => {
    const set = new Set();
    catalog.forEach((p) => (p.tags || []).forEach((t) => set.add(t)));
    return Array.from(set);
  }, [catalog]);

  function addToCart(product, size, qty = 1) {
    // backward-compatible: if color provided inside product.selectedColorId, prefer it
    const colorId = product._selectedColorId || null;
    const key = `${product.id}_${size || "-"}_${colorId || "-"}`;
    setCart((prev) => {
      const ix = prev.findIndex((x) => x.key === key);
      const imageUrl = (product.images && product.images[0]) || product.imageUrl || "";
      // resolve color label/hex from product.colors if present
      let colorLabel = null;
      let colorHex = null;
      if (colorId && product.colors) {
        const c = product.colors.find((x) => x.id === colorId);
        if (c) { colorLabel = c.label; colorHex = c.hex; }
      }
      const item = { key, id: product.id, title: product.title, price: product.price, size, qty, imageUrl, colorId, colorLabel, colorHex };
      const next = [...prev];
      if (ix >= 0) next[ix] = { ...next[ix], qty: next[ix].qty + qty };
      else next.push(item);
      return next;
    });
    // show toast
    setToast("Añadido al carrito");
    setTimeout(() => setToast(null), 2000);
  }

  function updateQty(key, qty) {
    setCart((prev) => prev.map((x) => (x.key === key ? { ...x, qty } : x)));
  }

  function removeItem(key) {
    setCart((prev) => prev.filter((x) => x.key !== key));
  }

  function clearCart() { setCart([]); }

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, it) => s + it.price * it.qty, 0);
    const shipping = 0; // define si quieres sumar algo fijo
    return { subtotal, shipping, total: subtotal + shipping };
  }, [cart]);

  function openAdmin() { setAdminOpen(true); }
  function unlockAdmin(pin) {
    if (pin === settings.ownerPIN) {
      setAdminUnlocked(true);
      setAdminOpen(false);
    } else {
      alert("PIN incorrecto");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50">
      <Header
        storeName={settings.storeName}
        adminActive={adminUnlocked}
        onAdminToggle={() => (adminUnlocked ? setAdminUnlocked(false) : openAdmin())}
        onOpenCart={() => setCartOpen(true)}
        cartCount={cart.reduce((s, it) => s + it.qty, 0)}
      />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {!adminUnlocked ? (
          <>
            {/* Logo central en la página principal (desde public/saudinologo.png) */}
            <div className="flex justify-center mb-6">
              <img src="/saudinologo.png" alt="Saudino" className="h-28 sm:h-36 object-contain" />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center mb-6">
              <input
                placeholder="Buscar productos..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 border rounded-xl px-4 py-2"
              />
              <div className="flex gap-2 overflow-auto">
                <button className={`px-3 py-2 rounded-xl border text-sm ${!tag ? "bg-black text-white" : ""}`} onClick={() => setTag("")}>Todos</button>
                {allTags.map((t) => (
                  <button key={t} className={`px-3 py-2 rounded-xl border text-sm ${tag === t ? "bg-black text-white" : "bg-white"}`} onClick={() => setTag(t)}>
                    #{t}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-sm text-gray-500">No hay productos que coincidan.</div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filtered.map((p) => (
                  <ProductCard key={p.id} product={p} onAdd={addToCart} />
                ))}
              </div>
            )}
          </>
        ) : (
          <AdminPanel catalog={catalog} setCatalog={setCatalog} settings={settings} setSettings={setSettings} />
        )}
      </main>

      <footer className="py-10 text-center text-xs text-gray-500">
        <div>⚠️ Esta demo no gestiona stock ni pagos. El pedido se envía como mensaje con el detalle del carrito.</div>
      </footer>

      <AdminGate open={adminOpen} onClose={() => setAdminOpen(false)} onUnlock={unlockAdmin} />
      <CartPanel
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart}
        onUpdateQty={updateQty}
        onRemove={removeItem}
        onClear={clearCart}
        totals={totals}
        settings={settings}
      />
      {/* Toast */}
      {toast ? (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-50">
          <div className="bg-black text-white px-4 py-2 rounded-full text-sm shadow-lg">{toast}</div>
        </div>
      ) : null}
    </div>
  );
}
