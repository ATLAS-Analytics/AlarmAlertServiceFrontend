export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="page wide">
        © {new Date().getFullYear()} University of Chicago. Supported by the Enrico Fermi Institute.
      </div>
    </footer>
  );
}
